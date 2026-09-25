-- MYK9-749 / MYK9-750: review-sweep fixes to three SECURITY DEFINER functions.
--
-- 1. withdraw_own_entry (MYK9-749, from the #2263 review):
--    - the eligibility SELECT takes FOR UPDATE, so a concurrent check-in or
--      payment cannot commit between the guards and the UPDATE (with
--      p_expected_version NULL the UPDATE re-checks nothing);
--    - a NULL entry_status no longer slips past the allow-list;
--    - the retired scratch-request literals are dropped, as 20260924094300
--      asked for the next time this function was replaced.
--    Deliberately NOT added: an entry-deadline or show-completion check. An
--    in-season or judge-change withdrawal happens after entries close by
--    design (Pull vs Withdraw); whether an owner may withdraw after the show
--    completed is an open product question, not a bug.
--
-- 2. guard_club_authorization_write (MYK9-750, from the #2272 review): the
--    ON DELETE SET NULL carve-out additionally requires that the recorded
--    authorizer no longer exists, so an ordinary club-admin PATCH can no
--    longer erase authorized_by.
--
-- 3. set_club_authorization (MYK9-750): the idempotency read locks the club
--    row.
--
-- Every body is copied from its LATEST defining migration, verified equal to
-- the live pg_get_functiondef on 2026-09-25 before editing:
--   withdraw_own_entry                -- 20260917214300
--   guard_club_authorization_write    -- 20260916004500
--   set_club_authorization            -- 20260916004500
-- Only the lines marked MYK9-749 / MYK9-750 change. ACLs are restated.
--
-- Behavioral coverage: supabase/tests/withdraw_own_entry_test.sql (NULL
-- status) and supabase/tests/club_authorization_gate_test.sql (case 15).

BEGIN;

CREATE OR REPLACE FUNCTION public.withdraw_own_entry(
  p_entry_id uuid,
  p_fields jsonb,
  p_expected_version integer,
  p_kind text DEFAULT 'withdraw',
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_person_id uuid;
  v_show_id uuid;
  v_dog_id uuid;
  v_handler_id uuid;
  v_entry_status text;
  v_deleted_at timestamptz;
  v_check_in_status text;
  v_is_in_ring boolean;
  v_is_scored boolean;
  v_current_version integer;
  v_is_manager boolean;
  v_is_owner boolean;
  v_updated_id uuid;
  v_new_version integer;
  v_target_status text;
  v_reason text;
  v_registry text;
  v_registry_known boolean;
  v_allowed_reasons text[];
  -- Statuses an entry may still be withdrawn or pulled FROM by its own
  -- exhibitor. Day-of and terminal states are excluded: those go through the
  -- ringside check-in path, which this function deliberately does not touch.
  -- `paid` is an ENTRY_STATUS, not a money fact — it sits in the pending bucket
  -- alongside `promotion-expired`, and an entry can hold it while
  -- `payment_status` is still 'pending' (the pay-by-check case). It is
  -- therefore reachable for owners, not dead.
  -- Both spellings of the move-up request status are listed because
  -- entries_entry_status_check admits both and the live column holds the
  -- hyphenated form: an unpaid exhibitor waiting on a secretary decision must
  -- still be able to leave the class. The two scratch-request spellings are
  -- gone: MYK9-719's CHECK retired them, and its header asked for the dead
  -- literals to go the next time this function was replaced (MYK9-749).
  v_withdrawable_statuses constant text[] := ARRAY[
    'no-status', 'draft', 'submitted', 'paid', 'confirmed',
    'pending-payment', 'promotion-expired',
    'move-up-requested', 'move_up_requested'
  ];
  -- The only check_in_status values that mean the dog is NOT yet at the show.
  -- Listing the permitted pair (rather than the day-of values to block) means a
  -- value added to `entries_check_in_status_check` later fails CLOSED rather
  -- than opening a new self-service window.
  v_pre_show_check_in constant text[] := ARRAY['no-status', 'pulled'];
BEGIN
  -- 0. Which act is this? Allow-list, never a free string.
  IF p_kind IS NULL OR p_kind NOT IN ('withdraw', 'pull') THEN
    RAISE EXCEPTION 'withdraw_own_entry: p_kind must be withdraw or pull, got %', p_kind
      USING errcode = '22023';
  END IF;

  v_target_status := CASE p_kind WHEN 'pull' THEN 'scratched' ELSE 'withdrawn' END;

  -- A WITHDRAWAL needs one of the two recognised reasons; a PULL must not carry
  -- one, because a pull is by definition "everything else". Enforced here as
  -- well as by entries_withdrawal_reason_code_check so the refusal is a
  -- sentence rather than a constraint violation.
  -- Both arms normalise the SAME way first, so '' and '   ' mean "no reason" on
  -- either side. Testing p_reason IS NOT NULL on the pull arm alone made an empty
  -- string a silent no-op for a withdrawal and a hard 22023 for a pull.
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  IF p_kind = 'withdraw' THEN
    IF v_reason IS NULL OR v_reason NOT IN ('in_season', 'judge_change') THEN
      RAISE EXCEPTION 'withdraw_own_entry: p_reason must be in_season or judge_change'
        USING errcode = '22023';
    END IF;
  ELSE
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION 'withdraw_own_entry: a pull carries no withdrawal reason'
        USING errcode = '22023';
    END IF;
  END IF;

  -- 1. The only transitions this function performs. `entry_status` must be
  -- PRESENT in p_fields and must agree with p_kind: this is not a
  -- general-purpose entries writer, and an omitted key must not act by default.
  -- Every other key in p_fields (including `withdrawal_reason`) is ignored.
  -- The message keeps its pre-MYK9-632 wording for the default kind so the
  -- existing behavioural contract still reads true.
  IF (p_fields ->> 'entry_status') IS DISTINCT FROM v_target_status THEN
    IF p_kind = 'withdraw' THEN
      RAISE EXCEPTION 'withdraw_own_entry only writes entry_status = withdrawn'
        USING errcode = '22023';
    END IF;
    RAISE EXCEPTION 'withdraw_own_entry: a pull only writes entry_status = scratched'
      USING errcode = '22023';
  END IF;

  SELECT e.show_id, e.dog_id, e.handler_id, e.entry_status,
         e.deleted_at, e.check_in_status, coalesce(e.is_in_ring, false),
         coalesce(e.is_scored, false), e.version
    INTO v_show_id, v_dog_id, v_handler_id, v_entry_status,
         v_deleted_at, v_check_in_status, v_is_in_ring,
         v_is_scored, v_current_version
    FROM public.entries e
   WHERE e.id = p_entry_id
     -- MYK9-749: the eligibility read LOCKS the row. With p_expected_version
     -- NULL (a cold replica) the UPDATE below re-checks nothing, so without
     -- the lock a check-in or payment committing between this read and that
     -- write was overwritten by a withdrawal it should have blocked.
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  -- 2. Resolve the caller. NULL for an anon / ringside-passcode session, which
  -- can never own an entry — the EXECUTE grant already excludes anon.
  SELECT p.id
    INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  -- 3. Restate the `entries_update` policy verbatim for the manager tier, so
  -- the secretary use of EntryEditDialog behaves exactly as it does today.
  v_is_manager := coalesce(public.can_manage_show(v_show_id), false);

  -- 4. Owner tier: the same scope `entries_select` grants an exhibitor over
  -- their own row (listed handler, dog owner, dog co-owner).
  v_is_owner := v_caller_person_id IS NOT NULL AND (
    v_handler_id = v_caller_person_id
    OR EXISTS (
      SELECT 1 FROM public.dogs d
       WHERE d.id = v_dog_id
         AND (d.owner_id = v_caller_person_id OR d.co_owner_id = v_caller_person_id)
    )
  );

  IF NOT (v_is_manager OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to withdraw entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  -- 4b. WHICH REASONS THIS SHOW'S REGISTRY RECOGNISES.
  --
  -- Placed AFTER the authorization raise on purpose. Its refusal names the
  -- registry ('ASCA does not recognise…'), and a caller who may not touch this
  -- entry must not be able to read a fact about the show off an error message —
  -- an unauthorized probe has to fail at 42501 and learn nothing else.
  --
  -- The two-value allow-list above is the platform's; this is the rulebook's,
  -- and they are not the same set. ASCA has NO in-season withdrawal at all —
  -- bitches in season may compete (they run last, in pants and a red bandana) —
  -- so `in_season` on an ASCA entry is not a reason, it is a wrong answer.
  --
  -- The client already hides it, but the client learns the registry from an
  -- asynchronous replica read that can be in flight, empty or failed, and a
  -- definer function may not depend on a caller having waited. Restated here for
  -- the same reason every other filter in this function is: the server is the
  -- only place this is guaranteed.
  --
  -- Resolution mirrors `getTrialRegistry`: a blank or missing `registry_id` on a
  -- trial that EXISTS is AKC, and an id we have no rulebook for admits both
  -- reasons rather than blocking a legitimate withdrawal — failing OPEN is right
  -- there, because refusing would be this function inventing a rule for a
  -- registry it knows nothing about, and the client greys Withdraw out for an
  -- unrecognised registry anyway.
  --
  -- That is DELIBERATELY not the same answer as "no trial found" below, and the
  -- asymmetry is the point: a trial row that exists is a trial whose registry
  -- DEFAULTED (`registry_id` is NOT NULL DEFAULT 'AKC'), which is a fact about
  -- the show. No trial row at all is the absence of the fact, so there is
  -- nothing to default to and the reason that only some registries have is
  -- refused.
  IF p_kind = 'withdraw' THEN
    -- Resolved through `classes`, NOT through `entries.trial_id`. That column is
    -- a nullable denormalisation, and a NULL there would have resolved to AKC
    -- and quietly admitted `in_season` on an ASCA show — the exact hole this
    -- guard exists to close. `entries.class_id -> classes.trial_id -> trials` is
    -- the join the other entry RPCs use (20260908134900, 20260909174329).
    SELECT nullif(btrim(coalesce(t.registry_id, '')), '')
      INTO v_registry
      FROM public.entries e
      JOIN public.classes c ON c.id = e.class_id
      JOIN public.trials t ON t.id = c.trial_id
     WHERE e.id = p_entry_id;
    v_registry_known := FOUND;

    IF NOT v_registry_known THEN
      -- No trial reachable, so no rulebook. Refuse the reason that only SOME
      -- registries have rather than guessing the permissive one: `judge_change`
      -- exists in all three, `in_season` does not exist in ASCA at all.
      IF v_reason <> 'judge_change' THEN
        RAISE EXCEPTION
          'withdraw_own_entry: cannot confirm the show''s registry for entry %, so only judge_change is accepted',
          p_entry_id
          USING errcode = '22023';
      END IF;
    ELSE
      -- Case-insensitive: `registry_id` is free text, and 'asca' is ASCA.
      v_allowed_reasons := CASE upper(coalesce(v_registry, 'AKC'))
        WHEN 'ASCA' THEN ARRAY['judge_change']
        ELSE ARRAY['in_season', 'judge_change']
      END;

      IF NOT (v_reason = ANY (v_allowed_reasons)) THEN
        RAISE EXCEPTION
          'withdraw_own_entry: % does not recognise the withdrawal reason %',
          upper(coalesce(v_registry, 'AKC')), v_reason
          USING errcode = '22023';
      END IF;
    END IF;
  END IF;

  -- 5. Owner-only limits. A manager is bound only by the policy restated in
  -- step 3 (they already have refund and lifecycle tooling for these cases).
  IF NOT v_is_manager THEN
    IF v_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Entry % has been removed', p_entry_id USING errcode = '42501';
    END IF;

    -- MONEY: there is NO payment guard on either act, by owner decision
    -- (2026-09-17). Neither act moves a cent — this function writes
    -- entry_status and a reason code and nothing else, and every money column
    -- (payment_status, refund_amount, refunded_at, refund_decision) is
    -- untouched on both arms. What the exhibitor's click does is RECORD what
    -- happened; the secretary confirms the refund afterwards on the
    -- reconciliation surface.
    --
    -- That surface is reachable for BOTH acts as of this file: the
    -- `set_entry_refund_decision` replacement at the bottom widens its own guard
    -- to accept a paid-online `withdrawn` row carrying a reason code, so the
    -- Deny control the queue renders for such a row actually saves. Before that
    -- widening the read half admitted the row and the write half refused it, and
    -- the secretary got 'We couldn't save that refund decision' forever.
    --
    -- The removed guard ('Entry % is paid; request a refund instead of
    -- withdrawing') read as caution and behaved as a trap: it left a paid
    -- exhibitor with no honest way to say they were not coming, and it kept
    -- their row out of the queue where the refund decision is made. A
    -- behavioural case pins that a paid withdrawal writes no money columns.

    -- coalesce: `NULL = ANY (...)` is NULL, and `IF NOT NULL` skipped the
    -- refusal, so a row with no status passed the allow-list (MYK9-749).
    IF NOT (coalesce(v_entry_status, '') = ANY (v_withdrawable_statuses)) THEN
      RAISE EXCEPTION 'Entry % cannot be withdrawn from status %', p_entry_id, v_entry_status
        USING errcode = '42501';
    END IF;

    IF v_is_scored THEN
      RAISE EXCEPTION 'Entry % has been scored and cannot be withdrawn', p_entry_id
        USING errcode = '42501';
    END IF;

    -- `self_checkin_entry` writes ONLY check_in_status and leaves
    -- entry_status='confirmed', so without this an exhibitor standing at the
    -- gate passes every guard above and removes their own entry mid-show. The
    -- day-of act belongs to ringside (`check_in_status = 'pulled'`), which this
    -- function deliberately leaves alone.
    IF v_is_in_ring
       OR (v_check_in_status IS NOT NULL
           AND NOT (v_check_in_status = ANY (v_pre_show_check_in))) THEN
      RAISE EXCEPTION 'Entry % is checked in at the show and cannot be withdrawn', p_entry_id
        USING errcode = '42501';
    END IF;
  END IF;

  -- 6. Optimistic concurrency, same contract as ringside_update_entry: the
  -- authoritative current version rides in DETAIL so the client can advance its
  -- token instead of regenerating the same conflicting write forever.
  IF p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Version conflict withdrawing entry % (expected %)',
      p_entry_id, p_expected_version
      USING errcode = '40001', detail = v_current_version::text;
  END IF;

  -- 7. Apply. entry_status, the reason CODE, and updated_at; `withdrawn_at` is
  -- stamped by trg stamp_entry_withdrawn_at, and the status-history trigger
  -- records the transition. A pull clears any code a previous withdrawal left,
  -- so the stored reason can never disagree with the stored act.
  UPDATE public.entries e
     SET entry_status = v_target_status,
         withdrawal_reason_code = v_reason,
         updated_at = now()
   WHERE e.id = p_entry_id
     AND (p_expected_version IS NULL OR e.version = p_expected_version)
  RETURNING e.id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    SELECT e.version INTO v_current_version FROM public.entries e WHERE e.id = p_entry_id;
    IF FOUND THEN
      RAISE EXCEPTION 'Version conflict withdrawing entry % (expected %)',
        p_entry_id, p_expected_version
        USING errcode = '40001', detail = v_current_version::text;
    END IF;
    RAISE EXCEPTION 'Entry % not found', p_entry_id USING errcode = 'P0002';
  END IF;

  SELECT e.version INTO v_new_version FROM public.entries e WHERE e.id = p_entry_id;
  RETURN v_new_version;
END;
$$;

COMMENT ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) IS
  'MYK9-535 / MYK9-632: owner-scoped removal of an entry from a class. p_kind '
  'withdraw writes entry_status=withdrawn plus one of the two recognised reason '
  'codes, narrowed to the ones the show''s registry recognises (ASCA: '
  'judge_change only); p_kind pull writes entry_status=scratched and carries no '
  'reason. '
  'NEITHER act has a payment guard and neither writes a money column (owner '
  'decision 2026-09-17): the exhibitor records what happened, the secretary '
  'confirms the refund through set_entry_refund_decision, which accepts both '
  'acts. Restates entries_update '
  'for managers and (exceeding) entries_select '
  'scope for owners; definer, so every filter is explicit. Called directly by the '
  'client and awaited: online-only, not queued through the MutationManager.';

REVOKE ALL ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) FROM public;
REVOKE ALL ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_club_authorization_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('myk9.club_authorization_write', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.authorized_at := NULL;
    NEW.authorized_by := NULL;
    RETURN NEW;
  END IF;

  IF NEW.authorized_at IS DISTINCT FROM OLD.authorized_at
     OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by THEN
    -- (c) ON DELETE SET NULL carve-out: a bare authorized_by -> NULL with
    -- authorized_at untouched, AND the recorded authorizer no longer exists.
    -- The shape alone admitted an ordinary club-admin PATCH that erased the
    -- authorizer with no audit row (MYK9-750). The FK action runs after the
    -- person row is gone, so only that path passes the NOT EXISTS; this
    -- function is SECURITY DEFINER, so people RLS does not hide the row.
    IF NEW.authorized_by IS NULL
       AND NEW.authorized_at IS NOT DISTINCT FROM OLD.authorized_at
       AND NOT EXISTS (SELECT 1 FROM public.people p WHERE p.id = OLD.authorized_by) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Club authorization is set only by a site admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_club_authorization_write() IS
  'MYK9-572: authorized_at/authorized_by are writable only through set_club_authorization(). clubs_update (is_platform_admin() OR is_club_admin(clubs.id), no WITH CHECK) and clubs_insert (any active secretary/club_admin) would otherwise let those roles set either column directly. Carve-outs: API-roles-only (mirrors enforce_show_publish_gate, 20260915221500) for direct superuser/service_role sessions, the myk9.club_authorization_write transaction-local GUC that set_club_authorization() sets immediately before its UPDATE, and the authorized_by FK''s ON DELETE SET NULL action (permitted only when authorized_at is unchanged AND the recorded authorizer no longer exists, MYK9-750). Otherwise: INSERT silently nulls both columns (a new club is never pre-authorized); UPDATE changing either column raises 42501.';

REVOKE ALL ON FUNCTION public.guard_club_authorization_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_club_authorization_write() FROM anon;

CREATE OR REPLACE FUNCTION public.set_club_authorization(
  p_club_id uuid,
  p_authorized boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- Round 4 (P3-2): every reference inside is already schema-qualified
-- (public.*, auth.uid()) or a pg_catalog builtin (now(), set_config(),
-- jsonb_build_object()) that resolves regardless of search_path, so the
-- looser `SET search_path = public` bought no convenience here and only
-- widened the surface for a search-path-hijack. Locked to ''.
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
  v_current_authorized_at timestamptz;
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Only site admins can authorize or revoke a club'
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-750: locked, so two site admins acting at once serialize here and
  -- the second sees the first's committed state. Unlocked, both could pass
  -- the idempotency check below (duplicate audit rows), or a revoke could
  -- return as a no-op before a concurrent authorize committed.
  SELECT authorized_at INTO v_current_authorized_at
  FROM public.clubs
  WHERE id = p_club_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club % not found', p_club_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: already in the requested state (double-click, retry after a
  -- slow network response, two site admins acting at once). Return early —
  -- no authorized_at/authorized_by churn (a repeat "authorize" must not stamp
  -- a fresh now() over the original authorization time or reassign
  -- authorized_by to whoever merely repeated the call) and no duplicate
  -- permission_audit_log row for the same action.
  IF (p_authorized AND v_current_authorized_at IS NOT NULL)
     OR (NOT p_authorized AND v_current_authorized_at IS NULL) THEN
    RETURN;
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  -- The one sanctioned path through guard_club_authorization_write()
  -- (section 1b above): open the GUC only for the duration of this UPDATE,
  -- then close it immediately — `true` (transaction-local, per set_config's
  -- own is_local argument) means it also clears automatically at COMMIT or
  -- ROLLBACK even if this function raised between the two calls.
  PERFORM set_config('myk9.club_authorization_write', 'on', true);

  UPDATE public.clubs
  SET authorized_at = CASE WHEN p_authorized THEN now() ELSE NULL END,
      authorized_by = v_actor_person_id
  WHERE id = p_club_id;

  PERFORM set_config('myk9.club_authorization_write', '', true);

  INSERT INTO public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  VALUES (
    v_actor_person_id,
    CASE WHEN p_authorized THEN 'club_authorized' ELSE 'club_authorization_revoked' END,
    'club',
    p_club_id,
    jsonb_build_object('club_id', p_club_id, 'authorized', p_authorized)
  );
END;
$$;

COMMENT ON FUNCTION public.set_club_authorization(uuid, boolean) IS
  'MYK9-572: the only write path for clubs.authorized_at/_by. Site-admin only (restates is_site_admin(), does not rely on clubs_update RLS). Idempotent: a call that would not change authorized_at''s null-ness (already authorized and asked to authorize, or already unauthorized and asked to revoke) returns immediately with no column churn and no audit row. Revoking never unpublishes the club''s existing shows — enforce_show_publish_gate only fires on a transition INTO published. Writes a permission_audit_log row for both directions (except the idempotent no-op case above).';

REVOKE ALL ON FUNCTION public.set_club_authorization(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_club_authorization(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_club_authorization(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
