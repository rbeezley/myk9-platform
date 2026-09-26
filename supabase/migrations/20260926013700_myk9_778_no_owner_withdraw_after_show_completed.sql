-- MYK9-778: an owner may not withdraw (or pull) an entry once the show has
-- finished. Owner decision 2026-09-25, on MYK9-749 item 1, which had recorded
-- the question as open and deliberately left the check out.
--
-- WHAT "FINISHED" MEANS. Either of the two facts the app already treats as the
-- end of a show, and nothing new:
--   * shows.status = 'completed' -- the secretary's closeout
--     (CloseOutShowAction / isShowClosedOut writes and reads exactly that); or
--   * the show's last calendar day is behind today ON THE SHOW'S CALENDAR --
--     the rule My Shows already uses to stop offering "Leave class"
--     (isPastShowEntry: last day before today; a multi-day show still running
--     today is NOT finished). `shows.start_date` / `end_date` are timestamptz
--     stored at midnight UTC, so the calendar day is taken in UTC, and "today"
--     is taken in the show's zone through private.show_time_zone -- the same
--     pair submit_show_entries's entry-window guards use (20260925181939).
--
-- WHAT IS DELIBERATELY NOT ADDED. No entry-close check: an in-season or
-- judge-change withdrawal happens after entries close by design (Pull vs
-- Withdraw), and a show that is running today still admits one.
--
-- SCOPE. Owner tier only, inside the existing `IF NOT v_is_manager` block. A
-- secretary keeps the reach entries_update gives them, as before. It applies to
-- both acts: a pull after the show is over is the same late removal.
--
-- REFUSAL. SQLSTATE MK006 (next free in the MKnnn app range), so the client
-- maps it to a definite sentence instead of the 42501 "ask the secretary"
-- fallback, which reads as if the entry might still be removable.
--
-- Body copied from the LATEST defining migration, 20260925072300, verified equal
-- to the live pg_get_functiondef on 2026-09-26 before editing. Only the lines
-- marked MYK9-778 change. ACL restated from the live proacl
-- ({postgres,service_role,authenticated}=X).
--
-- Behavioral coverage: supabase/tests/myk9_778_no_owner_withdraw_after_show_completed_test.sql.

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
  v_show_finished boolean;  -- MYK9-778
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

    -- MYK9-778: not after the show has finished (closed out by the secretary,
    -- or its last calendar day is behind today in the show's zone). See the
    -- header for why this is the definition and why entry close is NOT one.
    -- coalesce: a show row that cannot be read is not evidence the show ended.
    SELECT coalesce(
             s.status = 'completed'
             OR (now() AT TIME ZONE private.show_time_zone(s.id))::date
                > (coalesce(s.end_date, s.start_date) AT TIME ZONE 'UTC')::date,
             false)
      INTO v_show_finished
      FROM public.shows s
     WHERE s.id = v_show_id;

    IF coalesce(v_show_finished, false) THEN
      RAISE EXCEPTION 'Entry % cannot be withdrawn: the show has finished', p_entry_id
        USING errcode = 'MK006';
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
  'acts. MYK9-778: an owner may not use either act once the show has finished '
  '(status completed, or its last calendar day is past in the show''s zone); '
  'refused with SQLSTATE MK006. No entry-close check. Restates entries_update '
  'for managers and (exceeding) entries_select '
  'scope for owners; definer, so every filter is explicit. Called directly by the '
  'client and awaited: online-only, not queued through the MutationManager.';

REVOKE ALL ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) FROM public;
REVOKE ALL ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
