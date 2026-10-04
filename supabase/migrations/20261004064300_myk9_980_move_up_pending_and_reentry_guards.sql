-- =============================================================================
-- MYK9-980 — two server-side guards the client already enforces.
--
-- 1. move_up_entry refuses an entry that has not been accepted yet.
--    Owner decision (2026-10-03, MYK9-976 / PR #2708): Move up is hidden
--    until an entry is accepted. The RPC still moved a `submitted` or `paid`
--    entry for a stale client or a direct call. The refused set is the
--    client's `isPendingEntryStatus` (features/entry-operations/
--    classEntryBreakdown.ts): every raw status `getEntryStatusKind` calls
--    'pending' (submitted, pending, draft, no-status, pending-payment) plus
--    the owner's override that `paid` and `promotion-expired` stay pending.
--    A NULL status is not pending there either, so it is not refused here.
--    22023 with words, like the guards around it: `moveUpEntryRpc.ts` maps
--    22023 to 'refused' and shows the server's sentence verbatim.
--    Body copied from 20261002015900 (identical to live, diffed read-only
--    2026-10-04); only the new IF block is added.
--
-- 2. No online re-entry into a class the dog was withdrawn or pulled from
--    (folded in from MYK9-982, PR #2716). The client rule is
--    `getClassReEntryBlock` (services/entryDisplay/classReEntry.ts): a
--    non-deleted row for the same dog and class whose status is withdrawn
--    ('withdrawn', legacy 'cancelled') or scratched (rendered "Pulled"), or
--    whose check_in_status is 'pulled'. The cart's reconciliation keeps a
--    line when any such row still awaits payment (payment_status =
--    'pending'), so that exception is mirrored: an entry awaiting payment is
--    never what this refuses.
--
--    WHERE: both writers of a new exhibitor entry call
--    public.evaluate_entry_capacity immediately before their INSERT, and both
--    already turn its 'denied' outcome into "no entry":
--      - submit_show_entries (the wizard; authenticated) passes
--        (v_submission_source, v_is_official);
--      - create_online_paid_entry (paid-cart fulfillment; service_role only,
--        called by stripe-webhook) passes ('self_service', false).
--    (Both call sites read on live 2026-10-04 via pg_proc.prosrc.) So the
--    rule lives there once, not in two copies of two long functions. Body
--    copied from 20260712210000 (identical to live, diffed read-only
--    2026-10-04); only the new IF block is added.
--
--    WHO IS EXEMPT: exhibitor-originated means p_submission_source =
--    'self_service' AND NOT p_allow_override. submit_show_entries passes
--    v_is_official (site admin, show secretary, club admin of the show's
--    club) as p_allow_override, and only an official may send 'organizer'
--    or 'show_desk'. So secretary, mail-in and desk entry are untouched, and
--    so is staff using the exhibitor wizard for their own show -- the same
--    carve-out the class step gives `canManageShowSurface` staff. The paid
--    cart has no staff carve-out, matching the cart reconciliation, which
--    drops a withdrawn line for everyone.
--
--    MONEY: a paid cart line refused here comes back 'denied', which the
--    webhook already books as a no-service line: no entry, and the line's
--    share goes into the overflow decision and the CRITICAL "Cart overflow --
--    refund by hand" alert (MYK9-964). Nothing is refunded automatically and
--    no money is dropped silently. The client drops such a line at cart load
--    (#2716), so only a stale or hostile client reaches it. A Finish Payment
--    line (entry_id set) never calls create_online_paid_entry at all.
--
--    The wizard shows a denied outcome with its denial_reason; the client
--    maps the reason below to its own sentence (EntrySubmissionOutcomeAlert).
--
-- Grants: both functions keep owner, SECURITY DEFINER, search_path '' and
-- their ACLs (CREATE OR REPLACE preserves them); restated below as live has
-- them (2026-10-04): move_up_entry authenticated + service_role, never anon
-- or PUBLIC; evaluate_entry_capacity service_role only.
--
-- RLS: the definer bypass is unchanged in kind. The new read is of the same
-- dog's rows in the same class, and its only output is a 'denied' verdict.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. move_up_entry: refuse an entry that has not been accepted yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_up_entry(
  p_entry_id uuid,
  p_target_class_id uuid,
  p_new_entry_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_source         public.entries%ROWTYPE;
  v_target_show_id uuid;
  v_target_trial_id uuid;
  v_note           text;
BEGIN
  -- MYK9-923: gate before entry rows. The destination INSERT below takes the
  -- target's parent gates (entries trigger); take them now, before locking the
  -- source, so a concurrent soft_delete_* (gate first, then the entries it
  -- cascades) cannot hold the gate while waiting on our source row. The
  -- verdict is not used here: the target checks below and the trigger refuse
  -- a deleted parent with their own messages.
  PERFORM private.entry_deleted_parent(
    p_target_class_id,
    (SELECT c.trial_id FROM public.classes c WHERE c.id = p_target_class_id),
    NULL
  );

  SELECT * INTO v_source
  FROM public.entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  -- Restated authorization (see the header): identical to entries_update.
  IF NOT public.can_manage_show(v_source.show_id) THEN
    RAISE EXCEPTION 'You do not have permission to move entries in this show.'
      USING ERRCODE = '42501';
  END IF;

  -- A dog who has been pulled, withdrawn, scratched, marked absent, already
  -- moved, or soft-deleted is not movable. Refusing here is what lets the
  -- move-back restore an unambiguous source, and what stops a pulled dog being
  -- carried into a class the readiness counters then drop them from.
  IF v_source.deleted_at IS NOT NULL
     OR COALESCE(v_source.entry_status, '') IN
        ('moved', 'withdrawn', 'scratched', 'absent', 'not_accepted')
     OR v_source.check_in_status = 'pulled' THEN
    RAISE EXCEPTION 'This entry is not in a state that can be moved.'
      USING ERRCODE = '22023';
  END IF;

  -- MYK9-980: Move up waits for acceptance (owner decision 2026-10-03). The
  -- set is the client's `isPendingEntryStatus`, including the owner's
  -- override that 'paid' and 'promotion-expired' stay pending. See the header.
  IF v_source.entry_status IN (
       'submitted', 'pending', 'draft', 'no-status', 'pending-payment',
       'paid', 'promotion-expired'
     ) THEN
    RAISE EXCEPTION 'This entry has not been accepted yet. Accept it before moving it up.'
      USING ERRCODE = '22023', HINT = 'entry_not_accepted';
  END IF;

  -- A run that has STARTED cannot be moved out of the class it started in --
  -- the same rule `reverse_move_up_entry` applies to the destination, and for
  -- the same reason. Marking the source `moved` excludes it from the class
  -- rollup, the catalog and every registry report, so moving a scored entry
  -- would VACATE a result from the class it was earned in. `completed`,
  -- `in-ring` and `competing` all passed the movability guard above, which
  -- refuses only the approval-dimension states.
  --
  -- `checked-in` and `at-gate` are deliberately still movable: the dog is
  -- present and has not run, which is exactly when a secretary moves them.
  IF COALESCE(v_source.is_scored, false)
     OR COALESCE(v_source.is_in_ring, false)
     OR COALESCE(v_source.entry_status, '') IN ('in-ring', 'competing', 'completed')
     OR v_source.check_in_status IN ('in-ring', 'completed')
     OR v_source.scoring_started_at IS NOT NULL
     OR v_source.scoring_completed_at IS NOT NULL
     OR v_source.ring_entry_time IS NOT NULL
     OR COALESCE(v_source.result_status, 'pending') <> 'pending'
     OR v_source.final_placement IS NOT NULL
     OR COALESCE(v_source.points_earned, 0) <> 0
     OR COALESCE(v_source.search_time_seconds, 0) <> 0
     OR COALESCE(v_source.area1_time_seconds, 0) <> 0
     OR COALESCE(v_source.area2_time_seconds, 0) <> 0
     OR COALESCE(v_source.area3_time_seconds, 0) <> 0
     OR COALESCE(v_source.area4_time_seconds, 0) <> 0
     OR COALESCE(v_source.total_faults, 0) <> 0
     OR COALESCE(v_source.total_correct_finds, 0) <> 0
     OR COALESCE(v_source.total_incorrect_finds, 0) <> 0
     OR COALESCE(v_source.no_finish_count, 0) <> 0
     OR COALESCE(v_source.total_score, 0) <> 0
     OR COALESCE(v_source.points_possible, 0) <> 0 THEN
    RAISE EXCEPTION 'This run has already started, so the entry can no longer be moved.'
      USING ERRCODE = '22023';
  END IF;

  SELECT t.show_id, c.trial_id
  INTO v_target_show_id, v_target_trial_id
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_target_class_id
    AND c.deleted_at IS NULL
    AND t.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That class no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_show_id IS DISTINCT FROM v_source.show_id THEN
    RAISE EXCEPTION 'An entry can only move within its own show.'
      USING ERRCODE = '22023';
  END IF;

  IF p_target_class_id = v_source.class_id THEN
    RAISE EXCEPTION 'That entry is already in this class.' USING ERRCODE = '22023';
  END IF;

  -- The element/level ladder stays in the client (`utils/moveUpEligibility.ts`):
  -- it is registry-aware and the registry lives on the trial, not on a CHECK.
  -- What this function owns is what a stale or hostile client cannot be trusted
  -- with -- who may write, that the row is movable, and that both halves land.

  -- A dog already entered in the target class would otherwise die on
  -- `entries_dog_class_unique_idx` with raw constraint text in the secretary's
  -- toast. Say it in words instead, in the same 22023 the client already
  -- renders verbatim.
  IF EXISTS (
    SELECT 1
    FROM public.entries e
    WHERE e.dog_id = v_source.dog_id
      AND e.class_id = p_target_class_id
      AND e.deleted_at IS NULL
      -- Byte-identical to entries_dog_class_unique_idx's predicate above. A
      -- COALESCE here would be STRICTER than the index: a NULL entry_status is
      -- excluded from the index entirely, so the INSERT would have succeeded
      -- while this refused it in words.
      AND e.entry_status <> ALL (ARRAY['withdrawn'::text, 'scratched'::text])
  ) THEN
    RAISE EXCEPTION 'This dog is already entered in that class.' USING ERRCODE = '22023';
  END IF;

  v_note := 'Moved up from class ' || v_source.class_id::text
            || COALESCE(': ' || NULLIF(btrim(p_reason), ''), '');

  INSERT INTO public.entries (
    id, dog_id, show_id, class_id, trial_id,
    handler_id, handler, armband, jump_height,
    entry_status, check_in_status,
    payment_status, entry_fee,
    is_day_of_show, entry_source, registration_id,
    special_requests, moved_from_entry_id
  )
  VALUES (
    p_new_entry_id, v_source.dog_id, v_source.show_id, p_target_class_id, v_target_trial_id,
    v_source.handler_id, v_source.handler, v_source.armband, v_source.jump_height,
    -- The dog's APPROVAL state travels; a move-up is not an acceptance. Writing
    -- 'confirmed' unconditionally promoted a `pending-payment` or `submitted`
    -- entry the secretary had never accepted, and a round trip then restored it
    -- as 'confirmed' -- because the reverse restores from the destination.
    --
    -- The four REQUEST statuses are the exception, and they have to be: a
    -- request is a request to move THIS entry, and it is fulfilled the moment
    -- this function runs. `approveMoveUpRequestReplicated` requires the source
    -- to be 'move-up-requested' before it calls here, so inheriting that status
    -- put the destination straight back into `getPendingMoveUpRequests`'s
    -- queue -- the secretary approves, the row reappears in front of them, and
    -- approving again walks the dog another rung up the ladder. Same shape for
    -- 'scratch-requested': an exhibitor's request against the OLD class must not
    -- become a pending request against a class they never entered.
    --
    -- Kept in lockstep with MOVE_UP_REQUEST_STATUSES in
    -- features/show-map/moveUpRequestStatuses.ts, which the contract test pins.
    CASE
      WHEN COALESCE(v_source.entry_status, '') IN (
        'move-up-requested', 'move_up_requested', 'scratch-requested', 'scratch_requested'
      ) THEN 'confirmed'
      ELSE v_source.entry_status
    END,
    -- MYK9-640: a check-in travels, and ONLY as a check-in. 'pulled' cannot
    -- reach here (refused above); 'in-ring', 'at-gate' and 'completed' describe
    -- a run in the class being left, not the one being entered.
    CASE WHEN v_source.check_in_status = 'checked-in' THEN 'checked-in' ELSE 'no-status' END,
    -- Money-neutral. See the header.
    'pending', 0,
    -- Provenance, NOT money: who collected the entry and under which
    -- enrollment. `entry_source` is the only field that proves UKC collected a
    -- fee ('ukc_online'), and `is_day_of_show` is the day-of/pre-entry split --
    -- both are per-BUCKET lines on the registry report, so losing them bills
    -- the club for a run a registry already collected, and strands the
    -- destination off the exhibitor's order card.
    v_source.is_day_of_show, v_source.entry_source, v_source.registration_id,
    v_note, p_entry_id
  );

  -- Deliberately does NOT touch the source's `special_requests`: the FK above is
  -- the lineage, and that column is where a secretary writes "reactive dog,
  -- needs the ramp".
  UPDATE public.entries
  SET entry_status = 'moved'
  WHERE id = p_entry_id;

  RETURN p_new_entry_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. evaluate_entry_capacity: refuse online re-entry into a withdrawn class.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_entry_capacity(
  p_class_id uuid,
  p_dog_id uuid,
  p_exhibitor_id uuid,
  p_handler_id uuid,
  p_submission_source text,
  p_allow_override boolean DEFAULT false
)
RETURNS TABLE (
  outcome text,
  waitlist_entry_id uuid,
  waitlist_position integer,
  resolved_show_id uuid,
  resolved_trial_id uuid,
  capacity_override boolean,
  denial_reason text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trial_date date;
  v_allow_waitlist boolean;
  v_class_limit integer;
  v_class_count integer;
  v_is_full boolean := false;
  v_judge_id uuid;
  v_judge_capacity record;
  v_available integer;
  v_joined_via text;
  v_existing_waitlist_exhibitor_id uuid;
BEGIN
  IF p_submission_source NOT IN ('self_service', 'organizer', 'show_desk') THEN
    RAISE EXCEPTION 'invalid submission source: %', p_submission_source
      USING ERRCODE = '22023';
  END IF;

  SELECT c.trial_id, t.show_id, t.date, COALESCE(c.allow_waitlist, false), c.max_entries
  INTO resolved_trial_id, resolved_show_id, v_trial_date, v_allow_waitlist, v_class_limit
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'class % not found', p_class_id
      USING ERRCODE = 'P0002';
  END IF;

  -- One common first lock prevents two submit_show_entries batches from taking
  -- different class/judge locks in opposite order. Existing single-entry and
  -- waitlist promotion paths still coordinate on the exact class/judge locks.
  PERFORM pg_advisory_xact_lock(
    hashtext('showcapacity:' || resolved_show_id::text)
  );
  PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

  -- MYK9-980 (from MYK9-982): an exhibitor cannot enter a class online again
  -- after the dog was withdrawn or pulled from it. Staff and staff-only
  -- sources are exempt; a row still awaiting payment keeps the line, as the
  -- cart's reconciliation does. Checked before capacity, so a full class with
  -- a wait list cannot wait-list the dog either. See the migration header.
  IF p_submission_source = 'self_service'
     AND NOT COALESCE(p_allow_override, false)
     AND EXISTS (
       SELECT 1
       FROM public.entries e
       WHERE e.dog_id = p_dog_id
         AND e.class_id = p_class_id
         AND e.deleted_at IS NULL
         -- = ANY rather than an IN list: classEntryAvailabilityParity.test.ts
         -- reads this body's only IN list over entry_status as the capacity
         -- count, and this list is not one.
         AND (
           e.entry_status = ANY (ARRAY['withdrawn', 'cancelled', 'scratched'])
           OR e.check_in_status = 'pulled'
         )
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.entries e
       WHERE e.dog_id = p_dog_id
         AND e.class_id = p_class_id
         AND e.deleted_at IS NULL
         AND e.payment_status = 'pending'
     ) THEN
    outcome := 'denied';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := false;
    denial_reason := 'dog was withdrawn or pulled from this class';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_class_count
  FROM public.entries e
  WHERE e.class_id = p_class_id
    AND e.entry_status IN (
      'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment'
    )
    AND e.deleted_at IS NULL;

  IF COALESCE(v_class_limit, 0) > 0 AND v_class_count >= v_class_limit THEN
    v_is_full := true;
  END IF;

  FOR v_judge_id IN
    SELECT DISTINCT ja.person_id
    FROM public.judge_assignments ja
    WHERE ja.class_id = p_class_id
      AND ja.show_id = resolved_show_id
      AND ja.status = 'confirmed'
      AND ja.person_id IS NOT NULL
    ORDER BY ja.person_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)
    );

    SELECT *
    INTO v_judge_capacity
    FROM public.get_judge_day_capacity_live(v_judge_id, resolved_show_id, v_trial_date)
    LIMIT 1;

    IF p_submission_source = 'self_service' THEN
      v_available := COALESCE(v_judge_capacity.available_spots, 0);
    ELSE
      -- Organizer-entered rows consume the physical pool, including the
      -- portion reserved away from self-service online entry.
      v_available := GREATEST(
        0,
        COALESCE(v_judge_capacity.capacity, 0)
          - COALESCE(v_judge_capacity.confirmed_count, 0)
      );
    END IF;

    IF v_available <= 0 THEN
      v_is_full := true;
    END IF;
  END LOOP;

  IF NOT v_is_full THEN
    outcome := 'available';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := false;
    denial_reason := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_submission_source = 'show_desk' AND p_allow_override THEN
    outcome := 'available';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := true;
    denial_reason := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT v_allow_waitlist OR p_exhibitor_id IS NULL THEN
    outcome := 'denied';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := false;
    denial_reason := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Look up any ACTIVE wait-list row for this class+dog regardless of
  -- owner (the unique index waitlist_entries_active_class_dog_key allows
  -- at most one). Only reuse it when it belongs to the requesting
  -- exhibitor; a different exhibitor's active row must not be silently
  -- reported as "this requester is waitlisted" — that would misattribute
  -- offers/notifications that still target the original exhibitor.
  SELECT we.id, we.position, we.exhibitor_id
  INTO waitlist_entry_id, waitlist_position, v_existing_waitlist_exhibitor_id
  FROM public.waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.dog_id = p_dog_id
    AND we.status IN ('waiting', 'offered')
  ORDER BY we.position NULLS LAST, we.created_at
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_waitlist_exhibitor_id IS NOT DISTINCT FROM p_exhibitor_id THEN
      outcome := 'waitlisted';
      capacity_override := false;
      denial_reason := NULL;
      RETURN NEXT;
      RETURN;
    ELSE
      outcome := 'denied';
      waitlist_entry_id := NULL;
      waitlist_position := NULL;
      capacity_override := false;
      denial_reason := 'dog already on this class wait list for a different exhibitor';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(MAX(we.position), 0) + 1
  INTO waitlist_position
  FROM public.waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.status = 'waiting';

  v_joined_via := CASE
    WHEN p_submission_source = 'self_service' THEN 'online'
    ELSE 'mail_in'
  END;

  INSERT INTO public.waitlist_entries (
    class_id,
    exhibitor_id,
    dog_id,
    handler_id,
    position,
    joined_via
  )
  VALUES (
    p_class_id,
    p_exhibitor_id,
    p_dog_id,
    p_handler_id,
    waitlist_position,
    v_joined_via
  )
  ON CONFLICT (class_id, dog_id) WHERE status IN ('waiting', 'offered')
  DO NOTHING
  RETURNING id, position INTO waitlist_entry_id, waitlist_position;

  IF waitlist_entry_id IS NULL THEN
    -- Lost the race to a concurrent insert. Re-check ownership of the row
    -- that won, same exhibitor-aware logic as above.
    SELECT we.id, we.position, we.exhibitor_id
    INTO waitlist_entry_id, waitlist_position, v_existing_waitlist_exhibitor_id
    FROM public.waitlist_entries we
    WHERE we.class_id = p_class_id
      AND we.dog_id = p_dog_id
      AND we.status IN ('waiting', 'offered')
    ORDER BY we.position NULLS LAST, we.created_at
    LIMIT 1;

    IF FOUND AND v_existing_waitlist_exhibitor_id IS DISTINCT FROM p_exhibitor_id THEN
      outcome := 'denied';
      waitlist_entry_id := NULL;
      waitlist_position := NULL;
      capacity_override := false;
      denial_reason := 'dog already on this class wait list for a different exhibitor';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  outcome := 'waitlisted';
  capacity_override := false;
  denial_reason := NULL;
  RETURN NEXT;
END;
$$;

-- ACLs, restated as live has them (see the header).
REVOKE ALL ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
) TO service_role;

COMMENT ON FUNCTION public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean) IS
  'Shared post-lock class/judge-day capacity decision for paid-cart and submit_show_entries. '
  'Self-service preserves mail-in reserve; organizer uses physical capacity; authorized show_desk '
  'may record an explicit override. Not client-callable. Waitlist reuse is exhibitor-aware: an '
  'active class+dog wait-list row owned by a different exhibitor is denied with denial_reason, '
  'not silently reused (fixed 20260712210000). A self-service, non-official request for a class '
  'the dog was withdrawn or pulled from is denied with denial_reason (MYK9-980).';

NOTIFY pgrst, 'reload schema';

COMMIT;
