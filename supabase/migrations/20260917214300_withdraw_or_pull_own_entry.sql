-- MYK9-632: Withdraw and Pull are DIFFERENT acts and must write different states.
--
-- Before this migration the exhibitor had one action, labelled "Pull", warned
-- "the entry fee will not be refunded", and `withdraw_own_entry` wrote
-- `entry_status = 'withdrawn'`. The secretary then saw a withdrawal for an entry
-- the exhibitor was told would not be refunded, and an exhibitor with a real
-- season / judge-change reason had no way to record it.
--
-- Owner ruling 2026-09-17 (on the issue, verified against docs/rulebooks):
--   * Withdraw — exactly TWO reasons, `in_season` and `judge_change`. No
--     "other", no free text. Refund per the premium's rules.
--   * Pull — everything else. The CLUB decides whether to refund.
--   * "Scratch" and "Pull" are the SAME act; the word everywhere is Pull.
--
-- STATUS MAPPING (deliberately reuses the existing vocabulary — no new
-- `entries_entry_status_check` value):
--   Withdraw -> entry_status = 'withdrawn' + withdrawal_reason_code
--   Pull     -> entry_status = 'scratched'
-- 'scratched' is ALREADY the platform's stored word for a pull: the secretary's
-- pull-reconciliation surface (20260722160000_add_pull_refund_decisions.sql and
-- `isUnresolvedPullRefundDecision`) keys "an unresolved paid pull" on
-- `entry_status = 'scratched'`. Writing Pull as anything else would make that
-- surface unreachable. The COLUMN VALUE keeps its spelling; only the user-facing
-- word changes, per the owner's ruling.
--
-- WHY A NEW COLUMN. `entries.withdrawal_reason` already exists and holds FREE
-- TEXT from the secretary's own WithdrawalReasonDialog ("In-Season Dog: vet cert
-- on file") and, for pulls, the pull reason. A CHECK on it would reject every
-- one of those. `withdrawal_reason_code` is the two-value enumerated code; the
-- free-text column stays the note.

BEGIN;

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS withdrawal_reason_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'entries_withdrawal_reason_code_check'
       AND conrelid = 'public.entries'::regclass
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_withdrawal_reason_code_check
      CHECK (withdrawal_reason_code IS NULL
             OR withdrawal_reason_code IN ('in_season', 'judge_change'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.entries.withdrawal_reason_code IS
  'MYK9-632: the recognised WITHDRAWAL reason, from the two-value allow-list '
  '(in_season, judge_change). NULL on a pull and on every pre-MYK9-632 row. '
  'Distinct from withdrawal_reason, which is free-text secretary notes.';

-- `entries` is column-allowlisted for `authenticated` (see the grant-contract
-- migrations), so a new column is invisible to PostgREST without this. READ
-- only: the column is written exclusively by the definer RPC below and by the
-- secretary paths that already hold `entries_update`.
GRANT SELECT (withdrawal_reason_code) ON public.entries TO authenticated;

-- The 3-argument signature is DROPPED rather than left beside the new one:
-- PostgREST resolves by named arguments, and two candidates that both accept
-- (p_entry_id, p_fields, p_expected_version) are ambiguous. The new arguments
-- carry defaults, so an un-updated client's 3-argument call still RESOLVES here
-- — but it is then a withdrawal with no reason, which this function refuses
-- (22023). That is the intended failure mode for the deploy window: a reasonless
-- withdrawal is not one of the two acts, and refusing it is better than storing
-- one. The exhibitor sees "Something went wrong preparing this withdrawal".
DROP FUNCTION IF EXISTS public.withdraw_own_entry(uuid, jsonb, integer);

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
  v_payment_status text;
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
  -- Statuses an entry may still be withdrawn or pulled FROM by its own
  -- exhibitor. Day-of and terminal states are excluded: those go through the
  -- ringside check-in path, which this function deliberately does not touch.
  -- `paid` is an ENTRY_STATUS, not a money fact — it sits in the pending bucket
  -- alongside `promotion-expired`, and an entry can hold it while
  -- `payment_status` is still 'pending' (the pay-by-check case). It is
  -- therefore reachable for owners, not dead.
  -- Both spellings of each request status are listed because
  -- entries_entry_status_check admits both and the live column holds the
  -- hyphenated form: an unpaid exhibitor waiting on a secretary decision must
  -- still be able to leave the class.
  v_withdrawable_statuses constant text[] := ARRAY[
    'no-status', 'draft', 'submitted', 'paid', 'confirmed',
    'pending-payment', 'promotion-expired',
    'scratch-requested', 'scratch_requested',
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
  IF p_kind = 'withdraw' THEN
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');
    IF v_reason IS NULL OR v_reason NOT IN ('in_season', 'judge_change') THEN
      RAISE EXCEPTION 'withdraw_own_entry: p_reason must be in_season or judge_change'
        USING errcode = '22023';
    END IF;
  ELSE
    IF p_reason IS NOT NULL THEN
      RAISE EXCEPTION 'withdraw_own_entry: a pull carries no withdrawal reason'
        USING errcode = '22023';
    END IF;
    v_reason := NULL;
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

  SELECT e.show_id, e.dog_id, e.handler_id, e.entry_status, e.payment_status,
         e.deleted_at, e.check_in_status, coalesce(e.is_in_ring, false),
         coalesce(e.is_scored, false), e.version
    INTO v_show_id, v_dog_id, v_handler_id, v_entry_status, v_payment_status,
         v_deleted_at, v_check_in_status, v_is_in_ring,
         v_is_scored, v_current_version
    FROM public.entries e
   WHERE e.id = p_entry_id;

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

  -- 5. Owner-only limits. A manager is bound only by the policy restated in
  -- step 3 (they already have refund and lifecycle tooling for these cases).
  IF NOT v_is_manager THEN
    IF v_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Entry % has been removed', p_entry_id USING errcode = '42501';
    END IF;

    -- MONEY ARM, and the one guard the two acts do NOT share.
    --
    -- A WITHDRAWAL of a paid entry stays refused: the withdrawal reasons carry
    -- a rulebook refund entitlement, and the exhibitor's own click must not be
    -- what asserts it. They ask the secretary, who has the refund tooling.
    --
    -- A PULL of a paid entry is ALLOWED, because the club decides the refund
    -- and the surface that records that decision
    -- (`set_entry_refund_decision`, the Pull tab's "Issue refund / Deny refund")
    -- only ever sees a row once it is `entry_status = 'scratched'` and still
    -- paid. Refusing here would leave a paid exhibitor with no way to say they
    -- are not coming, which is the state the pre-MYK9-632 dialog pretended to
    -- offer. Nothing about the money moves here; only the entry's state does.
    IF p_kind = 'withdraw'
       AND v_payment_status IS DISTINCT FROM 'pending'
       AND v_payment_status IS DISTINCT FROM 'waived' THEN
      RAISE EXCEPTION 'Entry % is paid; request a refund instead of withdrawing', p_entry_id
        USING errcode = '42501';
    END IF;

    IF NOT (v_entry_status = ANY (v_withdrawable_statuses)) THEN
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
  'codes and stays refused on a paid entry; p_kind pull writes '
  'entry_status=scratched, carries no reason, and IS allowed on a paid entry '
  'because the club decides that refund on the secretary''s pull-reconciliation '
  'surface. Restates entries_update for managers and (exceeding) entries_select '
  'scope for owners; definer, so every filter is explicit. Called directly by the '
  'client and awaited: online-only, not queued through the MutationManager.';

REVOKE ALL ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) FROM public;
REVOKE ALL ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_own_entry(uuid, jsonb, integer, text, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
