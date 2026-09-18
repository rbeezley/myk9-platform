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
-- Which reason codes a withdrawal may carry is the SHOW'S REGISTRY's business,
-- not the platform's: ASCA recognises judge_change only. Checked here as well as
-- in the client — see step 4b.
-- Both are available on a PAID entry and neither moves money (owner decision
-- 2026-09-17); see the MONEY note in step 5.
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
--
-- The anon decision is stated EXPLICITLY, and it is "no access". anon holds no
-- grant on `public.entries` today and the ALTER DEFAULT PRIVILEGES trap fires on
-- CREATE TABLE, not on ADD COLUMN, so this REVOKE changes nothing about the live
-- ACL — it is kept because the grant-decision contract requires both API-role
-- decisions in the same file, and because a later broad column grant would
-- otherwise reach a column the ringside passcode session has no business
-- reading. Plain statement, ordered BEFORE the grant, so no splitter can reorder
-- it after (LESSONS: grant-contract-splitter).
REVOKE ALL (withdrawal_reason_code) ON public.entries FROM anon;
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

-- ---------------------------------------------------------------------------
-- The WRITE half of the reconciliation queue.
--
-- MYK9-632 widened the READ half — `isUnresolvedRemovalRefundDecision` and the
-- Pull tab now admit a paid-online `withdrawn` row that carries a reason code,
-- because the owner's decision made a paid entry withdrawable and that
-- withdrawal owes the secretary a decision under the premium's rules.
--
-- `set_entry_refund_decision` was not widened with it, and its guard is
-- `entry_status = 'scratched'`. So the queue rendered a Deny control for those
-- rows, the click raised 22023 'entry % is not an unresolved paid-online pull',
-- `isPullRefundSchemaUnavailable` did not match that message (it looks for a
-- missing COLUMN), and the secretary got "We couldn't save that refund decision.
-- Try again." for as long as they kept clicking. The row never left the queue
-- and `payoutLedger`'s unresolvedRefundDecisionCount counted it forever.
--
-- COPIED FROM THE LATEST DEFINITION (20260722160000 is the only file that
-- defines it; 20260728120000 only re-grants it — verified against the live
-- pg_get_functiondef before editing, LESSONS replace-function-latest). Every
-- other guard, the SECURITY DEFINER hygiene and the search_path are byte-
-- identical; exactly two things change — the status arm of the eligibility
-- guard, and the sentence it raises.
CREATE OR REPLACE FUNCTION public.set_entry_refund_decision(
  p_entry_id uuid,
  p_decision text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_entry_status text;
  v_payment_method text;
  v_payment_status text;
  v_refund_amount numeric;
  v_refund_decision text;
  v_withdrawal_reason_code text;
BEGIN
  IF p_decision <> 'denied' THEN
    RAISE EXCEPTION 'unsupported refund decision: %', p_decision
      USING ERRCODE = '22023';
  END IF;

  SELECT e.show_id,
         s.club_id,
         e.entry_status,
         e.payment_method,
         e.payment_status,
         e.refund_amount,
         e.refund_decision,
         e.withdrawal_reason_code
    INTO v_show_id,
         v_club_id,
         v_entry_status,
         v_payment_method,
         v_payment_status,
         v_refund_amount,
         v_refund_decision,
         v_withdrawal_reason_code
    FROM public.entries e
    JOIN public.shows s ON s.id = e.show_id
   WHERE e.id = p_entry_id
     AND e.deleted_at IS NULL
     FOR UPDATE OF e;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry % not found', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_show_secretary(v_show_id)
    OR (v_club_id IS NOT NULL AND public.is_club_admin(v_club_id))
  ) THEN
    RAISE EXCEPTION 'not authorized to decide refund for entry %', p_entry_id
      USING ERRCODE = '42501';
  END IF;

  -- The status arm now mirrors `isUnresolvedRemovalRefundDecision` EXACTLY, and
  -- that is the whole point: the surface that offers the decision and the
  -- function that records it must admit the same rows, or one of them is lying.
  -- A 'withdrawn' row must carry a recognised reason code — without one it is a
  -- secretary Decline/Reject or a pre-MYK9-632 row, which the queue excludes and
  -- which therefore must not be deniable here either.
  -- Every arm COALESCEs, exactly as the original did, because three-valued logic
  -- fails OPEN here: with a NULL `entry_status`, `NOT (NULL OR FALSE)` is NULL,
  -- the IF falls through, and a denial gets recorded on a row this guard was
  -- supposed to refuse.
  IF COALESCE(v_payment_method, '') <> 'online'
     OR COALESCE(v_payment_status, '') <> 'paid'
     OR COALESCE(v_refund_amount, 0) > 0
     OR NOT (
          COALESCE(v_entry_status, '') = 'scratched'
          OR (COALESCE(v_entry_status, '') = 'withdrawn'
              AND COALESCE(v_withdrawal_reason_code, '') IN ('in_season', 'judge_change'))
        ) THEN
    RAISE EXCEPTION 'entry % is not an unresolved paid-online pull or withdrawal', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  IF v_refund_decision = 'denied' THEN
    RETURN;
  END IF;

  UPDATE public.entries
     SET refund_decision = 'denied',
         refund_decided_at = now(),
         refund_decided_by = auth.uid(),
         updated_at = now()
   WHERE id = p_entry_id;
END;
$$;

COMMENT ON FUNCTION public.set_entry_refund_decision(uuid, text) IS
  'MYK9-632: records the secretary''s explicit "Deny refund" for a removal an '
  'exhibitor left behind. Accepts a paid-online pull (entry_status=scratched) '
  'and a paid-online withdrawal carrying one of the two recognised reason codes '
  '— the same row set isUnresolvedRemovalRefundDecision offers the control for. '
  'A successful Stripe refund is already authoritative via refund_amount / '
  'refunded_at, so only the denial needs a durable decision.';

-- Restated, not assumed. CREATE OR REPLACE preserves the existing ACL, but
-- naming it keeps this file honest about who may call the function it just
-- rewrote: 20260728120000 added service_role to the original grant.
REVOKE EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text)
  TO authenticated, service_role;

-- The reinstate trigger clears a decision when the row leaves the state it was
-- decided in, so that a row pulled again later needs a fresh decision. It only
-- knew about 'scratched'; a reinstated WITHDRAWN row would have kept a stale
-- 'denied' and never re-entered the queue. Copied from the live definition;
-- only the first condition changes.
CREATE OR REPLACE FUNCTION public.restrict_entry_refund_decision_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A reinstated entry needs a fresh decision if it is removed again later.
  -- This runs for every role, including service-role lifecycle mutations.
  -- MYK9-632: both removal states, and any move BETWEEN them — a pull that
  -- becomes a withdrawal is a different act and inherits nothing.
  IF TG_OP = 'UPDATE'
     AND old.entry_status IN ('scratched', 'withdrawn')
     AND new.entry_status IS DISTINCT FROM old.entry_status THEN
    new.refund_decision := NULL;
    new.refund_decided_at := NULL;
    new.refund_decided_by := NULL;
    RETURN new;
  END IF;

  IF current_user IN ('postgres', 'service_role') THEN
    RETURN new;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new.refund_decision IS NOT NULL
       OR new.refund_decided_at IS NOT NULL
       OR new.refund_decided_by IS NOT NULL THEN
      RAISE EXCEPTION 'refund decisions are written only through set_entry_refund_decision'
        USING ERRCODE = '42501';
    END IF;

    RETURN new;
  END IF;

  IF new.refund_decision IS DISTINCT FROM old.refund_decision
     OR new.refund_decided_at IS DISTINCT FROM old.refund_decided_at
     OR new.refund_decided_by IS DISTINCT FROM old.refund_decided_by THEN
    RAISE EXCEPTION 'refund decisions are written only through set_entry_refund_decision'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

-- Both API-role decisions stated explicitly, and both are "no access". This is a
-- TRIGGER function: it runs as part of the DML that fires it and is never called
-- by a caller, so nothing needs EXECUTE on it — `service_role` included, which
-- is why it is named here too rather than left with PUBLIC's default. (The
-- trigger still fires for service-role DML: a trigger runs on the table's own
-- authority, not the writer's EXECUTE privilege.) The original (20260722160000)
-- predates the grant-decision contract and said nothing at all.
REVOKE EXECUTE ON FUNCTION public.restrict_entry_refund_decision_columns()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
