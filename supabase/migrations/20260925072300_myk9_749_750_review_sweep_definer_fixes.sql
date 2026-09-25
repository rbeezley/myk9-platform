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
-- 4. seed_demo_assert_no_paid_strays (MYK9-748, from the #2307 review): the
--    Stripe-order arm also names the seed's own enrollment ...070, which the
--    seed deletes by id wherever it sits. Not a definer function (INVOKER,
--    seed-maintenance only), but it rides here rather than in a migration of
--    its own.
--
-- Every body is copied from its LATEST defining migration, verified equal to
-- the live pg_get_functiondef on 2026-09-25 before editing:
--   withdraw_own_entry                -- 20260917214300
--   guard_club_authorization_write    -- 20260916004500
--   set_club_authorization            -- 20260916004500
--   seed_demo_assert_no_paid_strays   -- 20260916213500
-- Only the lines marked MYK9-748 / MYK9-749 / MYK9-750 change. ACLs are restated.
--
-- Behavioral coverage: supabase/tests/withdraw_own_entry_test.sql (NULL
-- status), supabase/tests/club_authorization_gate_test.sql (case 15) and
-- supabase/tests/seed_demo_paid_stray_guard_scopes_test.sql (F538.26).

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
-- Live already holds no authenticated EXECUTE (proacl on 2026-09-25:
-- postgres, service_role). A trigger function's EXECUTE is checked only at
-- CREATE TRIGGER, never when it fires, so this restates the decision without
-- changing what a client can do.
REVOKE ALL ON FUNCTION public.guard_club_authorization_write() FROM authenticated;

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

CREATE OR REPLACE FUNCTION public.seed_demo_assert_no_paid_strays()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_real integer; v_bare integer; v_ids text; v_bare_ids text;
  v_enroll_real integer; v_enroll_ids text;
  v_order_real integer; v_order_ids text;
BEGIN
  -- Guard the HARM, not the label. A paid/refunded row that also carries a
  -- trail — entry_status_history, a Stripe payment intent or order, a recorded
  -- payment reference, a refund — loses that trail when a parent cascade takes
  -- it, and the reseed deletes all four of entries' cascade parents (classes,
  -- dogs, shows, trials; pg_constraint confdeltype='c' on each). Those abort.
  --
  -- A bare `payment_status='paid'` with NONE of that corroboration is a QA-walk
  -- artifact, not money: nothing is lost by letting it cascade. Aborting on
  -- those put a mandatory manual DELETE in front of the reseed, which is the
  -- tool the seed-reset runbook reaches for when staging is already broken, and
  -- any walk that marks a demo entry paid re-armed it. Those WARN instead, so
  -- they stay visible without wedging recovery.
  --
  -- The seed cannot trip either branch on its own rows: both of its entry
  -- deletes run before this call, and every INSERT INTO public.entries in that
  -- file writes into the myk9_109 id range or the hard-coded id list they
  -- remove.
  WITH scope_shows AS (
    SELECT id FROM public.shows
    WHERE id IN ('dededede-0000-0000-0000-000000000010',
                 'dededede-0000-0000-0000-000000000011',
                 'dededede-0000-0000-0000-000000000012')
       OR (id >= 'a1090000-0000-0000-0010-000000000000'::uuid
           AND id <  'a1090000-0000-0000-0011-000000000000'::uuid)
  ),
  stray AS (
    SELECT e.id, e.stripe_payment_intent_id, e.payment_reference, e.refunded_at,
           e.refund_amount, e.refund_decided_at,
           e.payment_method, e.payment_received_on, e.payment_notes, e.entry_fee
    FROM public.entries e
    WHERE e.payment_status IN ('paid', 'refunded')
      AND (e.show_id IN (SELECT id FROM scope_shows)
           OR e.trial_id IN (SELECT id FROM public.trials WHERE show_id IN (SELECT id FROM scope_shows))
           OR e.class_id IN (SELECT c.id FROM public.classes c
                             JOIN public.trials t ON t.id = c.trial_id
                             WHERE t.show_id IN (SELECT id FROM scope_shows))
           OR (e.dog_id >= 'a1090000-0000-0000-0001-000000000000'::uuid
               AND e.dog_id <  'a1090000-0000-0000-0002-000000000000'::uuid)
           OR e.dog_id IN ('dededede-0000-0000-0000-000000000041','dededede-0000-0000-0000-000000000042',
                           'dededede-0000-0000-0000-000000000043','dededede-0000-0000-0000-000000000044',
                           'dededede-0000-0000-0000-000000000045','dededede-0000-0000-0000-000000000046'))
  ),
  substantiated AS (
    SELECT s.id FROM stray s
    WHERE s.stripe_payment_intent_id IS NOT NULL
       OR s.payment_reference IS NOT NULL
       OR s.refunded_at IS NOT NULL
       OR s.refund_amount IS NOT NULL
       OR s.refund_decided_at IS NOT NULL
       -- A check or cash payment a secretary recorded has no Stripe trail BY
       -- DESIGN. Keying corroboration on Stripe-shaped evidence alone made a
       -- recorded $30 check read as an artifact, which is how this guard came
       -- to classify money as disposable to keep the script green.
       --
       -- MYK9-539: but ONE method is a label rather than a payment.
       -- 'secretary_paid' is the secretary wizard's DEFAULT and is routinely
       -- written on a $0.00 entry, where no money moved and nothing is lost by
       -- the cascade; aborting on it put a mandatory manual DELETE in front of
       -- the recovery tool. So that method — and only that method — has to
       -- clear a non-zero entry_fee before it counts as corroboration.
       -- Everything else keeps the unconditional reading, on purpose and
       -- fail-safe in two directions: a recorded check or cash payment still
       -- aborts at ANY fee (a $0 cheque is nonsense, and refusing costs an
       -- operator one deliberate DELETE while the alternative destroys a
       -- ledger row), and a payment method added to the app LATER lands in the
       -- unconditional branch by default rather than in the lenient one.
       --
       -- The fee condition is deliberately NOT hoisted onto the whole CTE
       -- either: every other column here (a Stripe intent, a reference, a
       -- received-on date, operator notes, a refund, history) is evidence of
       -- money on its own terms, and an `AND entry_fee > 0` over all of them
       -- would collapse the substantiated/bare split instead of narrowing it —
       -- every demo entry carries a fee.
       OR (s.payment_method IS NOT NULL AND s.payment_method <> 'waived'
           AND (s.payment_method <> 'secretary_paid' OR coalesce(s.entry_fee, 0) > 0))
       OR s.payment_received_on IS NOT NULL
       OR s.payment_notes IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.entry_status_history h WHERE h.entry_id = s.id)
       OR EXISTS (SELECT 1 FROM public.stripe_orders o WHERE o.entry_ids @> ARRAY[s.id])
  ),
  -- MYK9-528. Unlike the entries arm above, this arm has NO trail-substantiated
  -- vs. bare split — ANY in-scope paid/refunded enrollment aborts the reseed.
  -- The secretary's "Mark Paid Online" action (EnrollmentCard.tsx ->
  -- updateEnrollmentPaymentStatus) writes payment_status='paid_online' with no
  -- payment_reference, no paid_amount, no linked stripe_orders row — nothing a
  -- trail requirement could see — so requiring a trail here let a real paid
  -- enrollment cascade away silently, which is the opposite of what this guard
  -- exists for. The WARN-then-cascade leniency above exists to keep the
  -- 1260-row load-entries reseed from wedging on QA-walk noise; enrollments is
  -- a handful of rows and never needs that leniency.
  --
  -- "Paid" mirrors the entries arm's disposition (paid ∪ refunded, never
  -- pending/waived) widened to enrollments' own richer payment_status
  -- vocabulary (migration 168): 'paid' is the generic value the webhook
  -- trigger and the secretary_paid/group_payment UI paths write; 'paid_online'
  -- / 'paid_by_cash' / 'paid_by_check' are the specific values the same UI
  -- also writes (buildEnrollmentPaymentFields); 'refunded' / 'partial_refund'
  -- are the two refund outcomes (enrollmentPayment.ts). This matches
  -- apps/myk9show/src/utils/enrollmentGrouping.ts's dispositionOf().
  enrollment_stray AS (
    SELECT en.id
    FROM public.enrollments en
    WHERE en.payment_status IN
            ('paid', 'paid_online', 'paid_by_cash', 'paid_by_check', 'refunded', 'partial_refund')
      AND en.show_id IN (SELECT id FROM scope_shows)
      -- The seed's own multi-dog order (section 6b, id ...070) is paid by
      -- fixture, and unlike the entries case above there is no pre-guard
      -- delete to clear it first: entries.registration_id (NO ACTION) must be
      -- cleared before the enrollment itself can go, and that clear runs much
      -- further down the seed. So it is still present, unexcluded, every time
      -- this runs. Exclude it by id — confirmed the ONLY enrollment the seed
      -- inserts (one INSERT INTO public.enrollments in that file).
      AND en.id <> 'dededede-0000-0000-0000-000000000070'
  ),
  -- MYK9-527. Both stripe_orders scope FKs are ON DELETE RESTRICT as of
  -- migration 20260915191700, so any order pointing at a show the reseed
  -- deletes — or at an enrollment on one of those shows, which cascades from
  -- shows — now ABORTS the reseed with a bare 23503 somewhere deep in the
  -- delete sequence instead of silently nulling the ledger. Refuse here
  -- instead, before the first parent delete, with the same operator
  -- instructions the two arms above carry.
  --
  -- Scoped to EVERY show in scope_shows, not only show ...010: the narrower
  -- guard further down section 0 (added in #2248) covers the demo exhibitor's
  -- enrollment and show ...010 only, so an order on ...011, ...012 or any
  -- a1090000… load show was unguarded. That is the mechanism that produced the
  -- 22 fully-orphaned rows on staging.
  --
  -- Rows whose scope columns are ALREADY null are deliberately NOT matched:
  -- they reference no parent, so RESTRICT cannot fire on them and they block
  -- nothing. The seed reports them with its own RAISE WARNING instead.
  --
  -- MYK9-748: the seed ALSO deletes its own enrollment ...070 by id, wherever
  -- it sits. Reassigned to a show outside scope_shows, an order on it matched
  -- neither route above, and the reseed died on the raw RESTRICT error this
  -- arm exists to replace. It is named here on its own.
  order_stray AS (
    SELECT so.id
    FROM public.stripe_orders so
    WHERE so.show_id IN (SELECT id FROM scope_shows)
       OR so.enrollment_id IN (
            SELECT en.id FROM public.enrollments en
            WHERE en.show_id IN (SELECT id FROM scope_shows)
          )
       OR so.enrollment_id = 'dededede-0000-0000-0000-000000000070'
  )
  SELECT (SELECT count(*) FROM substantiated),
         (SELECT count(*) FROM stray) - (SELECT count(*) FROM substantiated),
         -- Capped: an unbounded list put 756 ids in one error line when it ran.
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM substantiated ORDER BY id LIMIT 10) t),
         (SELECT string_agg(t.id::text || ' (method=' || coalesce(t.payment_method,'none')
                            || ', fee=' || coalesce(t.entry_fee::text,'none') || ')', ', ' ORDER BY t.id)
          FROM (SELECT id, payment_method, entry_fee FROM stray
                WHERE id NOT IN (SELECT id FROM substantiated) ORDER BY id LIMIT 10) t),
         (SELECT count(*) FROM enrollment_stray),
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM enrollment_stray ORDER BY id LIMIT 10) t),
         (SELECT count(*) FROM order_stray),
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM order_stray ORDER BY id LIMIT 10) t)
    INTO v_real, v_bare, v_ids, v_bare_ids, v_enroll_real, v_enroll_ids,
         v_order_real, v_order_ids;

  IF v_bare > 0 THEN
    RAISE WARNING 'seed-demo: % paid/refunded entr(ies) on data this reseed deletes carry no payment trail (no history, no Stripe record, no reference, no non-zero recorded payment) and will be removed with their parents. First ids: %', v_bare, v_bare_ids;
  END IF;

  IF v_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % paid or refunded entr(ies) with a real payment trail sit on a show, trial, class or dog this reseed deletes — refusing to cascade them away. First ids: %. For the full set, run the substantiated CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, HARD-delete those rows: DELETE FROM public.entries WHERE id IN (...). Soft-deleting will NOT clear this — the guard ignores deleted_at on purpose, because a soft-deleted row still cascades. Never widen this guard to get past it.', v_real, v_ids;
  END IF;

  IF v_enroll_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % paid or refunded enrollment(s) sit on a show this reseed deletes — refusing to cascade them away. First ids: %. For the full set, run the enrollment_stray CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, HARD-delete those rows from public.enrollments by id (there is no soft-delete column to set instead — a cascade from shows takes the row regardless). Never widen this guard to get past it.', v_enroll_real, v_enroll_ids;
  END IF;

  IF v_order_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % Stripe order(s) point at a show this reseed deletes, or at an enrollment on one of those shows or the seed''s own enrollment ...070 — refusing to orphan a money ledger row (MYK9-527). First ids: %. Both scope FKs are ON DELETE RESTRICT (migration 20260915191700), so continuing would abort with a raw foreign-key violation later anyway. For the full set, run the order_stray CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, resolve those orders deliberately — reassign their scope, or delete them only as a reviewed operator step, remembering public.stripe_order_refunds.order_id is RESTRICT too. Never widen this guard to get past it.', v_order_real, v_order_ids;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.seed_demo_assert_no_paid_strays() IS
  'Seed-maintenance guard (MYK9-538). Raises if supabase/seed-demo.sql would cascade away a paid/refunded entry with a payment trail, a paid enrollment, or a scoped Stripe order. Called only by the reseed under the postgres/service role; never exposed to clients.';

-- Not an application RPC. Nothing in the client should ever be able to run a
-- function that names the seed's fixed ids and raises on live money rows.
REVOKE ALL ON FUNCTION public.seed_demo_assert_no_paid_strays() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_demo_assert_no_paid_strays() FROM anon;
REVOKE ALL ON FUNCTION public.seed_demo_assert_no_paid_strays() FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
