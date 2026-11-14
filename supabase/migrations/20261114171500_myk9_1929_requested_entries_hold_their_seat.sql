-- MYK9-1929 phase 1 (review fix): an entry with a waiting class change request has
-- not left its class, so it keeps holding its seat in that class and judge day.
--
-- The request is the existing move-up request (entry_status = 'move-up-requested'),
-- and that status is what the secretary's Move-ups list, its count, approve / deny
-- (requireRequestStatus) and move_up_entry key on, so the request cannot be recorded
-- any other way without reworking all of them (that is Phase 3). But none of the
-- capacity readers counted 'move-up-requested', so an exhibitor in a full class
-- (10 of 10) who asked for a change dropped the class to 9, another exhibitor's
-- online entry took the seat, and taking the request back restored 'confirmed'
-- with no capacity check: 11 of 10 and a judge day over its limit.
--
-- The fix is on the counting side: every reader that lists the statuses holding a
-- spot ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring',
-- 'pending-payment') now lists 'move-up-requested' too. Each function below is
-- copied from the LATEST migration that defines it, with only that one token added:
--   class_entry_availability        20261005184700 (MYK9-1019)
--   evaluate_entry_capacity         20261005184700 (MYK9-1019)
--   get_judge_day_capacity_live     20261007184317 (MYK9-1016)
--   promote_waitlist_entry_internal 20261005031700 (MYK9-1012)
--   notify_mail_in_waitlist_head    20261007012700 (MYK9-1021)
--   judge_day_summary (view)        20261007031837 (MYK9-1020)
-- CREATE OR REPLACE keeps each function's comment, owner and grants. Not changed:
-- private.entries_server_capacity_override (INSERT-only marker; a new row is never
-- move-up-requested) and manager_held_spot_count (counts cart holds, no status list).
--
-- Side effect, on purpose: the secretary's existing move-up requests (the client
-- path) hold their seat too, which is what they always should have done.

BEGIN;

CREATE OR REPLACE FUNCTION public.class_entry_availability(
  p_class_ids uuid[],
  p_exclude_auth_user_id uuid DEFAULT NULL,
  p_count_holds boolean DEFAULT true
)
RETURNS TABLE (
  class_id uuid,
  entry_count integer,
  waitlist_count integer,
  has_started boolean,
  class_full boolean,
  judge_id uuid,
  judge_day_available integer,
  judge_day_full boolean,
  allow_waitlist boolean,
  self_service_block text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH requested AS (
    SELECT
      c.id,
      c.status,
      c.max_entries,
      public.class_allows_waitlist(c.id) AS allow_waitlist,
      t.show_id,
      t.date AS trial_date
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    WHERE c.id = ANY (p_class_ids)
  ),
  counted AS (
    SELECT
      r.*,
      (
        SELECT COUNT(*)::integer
        FROM public.entries e
        WHERE e.class_id = r.id
          AND e.entry_status IN (
            'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment', 'move-up-requested'
          )
          AND e.deleted_at IS NULL
      )
      -- MYK9-1012: a spot a cart holds at Pay is taken until the hold ends.
      + CASE
          WHEN p_count_holds THEN public.held_spot_count(ARRAY[r.id], p_exclude_auth_user_id)
          ELSE 0
        END AS entry_count,
      (
        SELECT COUNT(*)::integer
        FROM public.waitlist_entries we
        WHERE we.class_id = r.id
          AND we.status = 'waiting'
      ) AS waitlist_count,
      EXISTS (
        SELECT 1
        FROM public.entries e
        WHERE e.class_id = r.id
          AND e.deleted_at IS NULL
          AND (e.is_in_ring IS TRUE OR e.is_scored IS TRUE)
      ) AS has_started
    FROM requested r
  ),
  tightest_judge_day AS (
    SELECT DISTINCT ON (d.class_id)
      d.class_id,
      d.judge_id AS person_id,
      d.day_remaining AS available
    FROM public.class_judge_day_capacity(p_class_ids, p_exclude_auth_user_id, p_count_holds) d
    ORDER BY d.class_id, d.day_remaining, d.judge_id
  ),
  decided AS (
    SELECT
      c.id,
      c.status,
      c.entry_count,
      c.waitlist_count,
      c.has_started,
      c.allow_waitlist,
      (COALESCE(c.max_entries, 0) > 0 AND c.entry_count >= c.max_entries) AS class_full,
      tj.person_id AS judge_id,
      tj.available AS judge_day_available,
      COALESCE(tj.available <= 0, false) AS judge_day_full
    FROM counted c
    LEFT JOIN tightest_judge_day tj ON tj.class_id = c.id
  )
  SELECT
    d.id,
    d.entry_count,
    d.waitlist_count,
    d.has_started,
    d.class_full,
    d.judge_id,
    d.judge_day_available,
    d.judge_day_full,
    d.allow_waitlist,
    CASE
      WHEN d.status = 'cancelled' THEN 'cancelled'
      WHEN d.status = 'in_progress' OR d.has_started THEN 'started'
      WHEN d.status = 'completed' THEN 'finished'
      WHEN (d.class_full OR d.judge_day_full) AND NOT d.allow_waitlist THEN 'full'
      ELSE NULL
    END
  FROM decided d;
$$;


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

  SELECT c.trial_id, t.show_id, t.date, public.class_allows_waitlist(c.id), c.max_entries
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
      'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment', 'move-up-requested'
    )
    AND e.deleted_at IS NULL;

  -- MYK9-1012: a spot a cart holds at Pay is taken until the hold ends. The
  -- line being fulfilled released its own hold first (fulfill_cart_line).
  v_class_count := v_class_count + public.held_spot_count(ARRAY[p_class_id]);

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

CREATE OR REPLACE FUNCTION public.get_judge_day_capacity_live(
  p_judge_id uuid,
  p_show_id uuid,
  p_date date,
  p_exclude_auth_user_id uuid DEFAULT NULL,
  p_count_holds boolean DEFAULT true
)
RETURNS TABLE (
  judge_id uuid,
  show_date date,
  capacity integer,
  confirmed_count integer,
  waitlist_count integer,
  mail_in_reserved integer,
  available_spots integer,
  class_ids uuid[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_capacity integer;
  v_override integer;
  v_show_capacity integer;
  v_confirmed integer;
  v_waitlist integer;
  v_reserved integer;
  v_class_ids uuid[];
  v_mail_in_strategy text;
  v_mail_in_value integer;
  v_mail_in_auto_release boolean;
  v_mail_in_release_date date;
BEGIN
  SELECT COALESCE(ARRAY_AGG(DISTINCT ja.class_id), ARRAY[]::uuid[])
  INTO v_class_ids
  FROM public.judge_assignments ja
  JOIN public.classes c ON c.id = ja.class_id
  JOIN public.trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed';

  SELECT
    s.default_judge_day_capacity,
    s.mail_in_strategy,
    s.mail_in_value,
    s.mail_in_auto_release,
    s.mail_in_release_date
  INTO
    v_show_capacity,
    v_mail_in_strategy,
    v_mail_in_value,
    v_mail_in_auto_release,
    v_mail_in_release_date
  FROM public.shows s
  WHERE s.id = p_show_id;

  SELECT MAX(ja.day_capacity_override)
  INTO v_override
  FROM public.judge_assignments ja
  JOIN public.classes c ON c.id = ja.class_id
  JOIN public.trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed'
    AND ja.day_capacity_override IS NOT NULL;

  v_capacity := COALESCE(v_override, v_show_capacity, 125);

  v_reserved := 0;
  IF NOT (
    COALESCE(v_mail_in_auto_release, false)
    AND v_mail_in_release_date IS NOT NULL
    AND v_mail_in_release_date <= CURRENT_DATE
  ) THEN
    IF v_mail_in_strategy = 'fixed' THEN
      v_reserved := GREATEST(0, COALESCE(v_mail_in_value, 0));
    ELSIF v_mail_in_strategy = 'percentage' THEN
      v_reserved := GREATEST(0, FLOOR(v_capacity::numeric * COALESCE(v_mail_in_value, 0) / 100.0));
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO v_confirmed
  FROM public.entries e
  WHERE e.class_id = ANY(v_class_ids)
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment', 'move-up-requested')
    AND e.deleted_at IS NULL;

  -- MYK9-1012: a spot a cart holds at Pay is taken until the hold ends.
  IF p_count_holds THEN
    v_confirmed := v_confirmed + public.held_spot_count(v_class_ids, p_exclude_auth_user_id);
  END IF;

  SELECT COUNT(*)
  INTO v_waitlist
  FROM public.waitlist_entries we
  WHERE we.class_id = ANY(v_class_ids)
    AND we.status = 'waiting';

  judge_id := p_judge_id;
  show_date := p_date;
  capacity := v_capacity;
  confirmed_count := v_confirmed;
  waitlist_count := v_waitlist;
  mail_in_reserved := v_reserved;
  available_spots := GREATEST(0, v_capacity - v_confirmed - v_reserved);
  class_ids := v_class_ids;

  RETURN NEXT;
END;
$$;


CREATE OR REPLACE FUNCTION public.promote_waitlist_entry_internal(
  p_waitlist_entry_id uuid,
  p_deadline_hours integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wl waitlist_entries%ROWTYPE;
  v_new_entry_id uuid;
  v_deadline_hours integer;
  v_class_limit integer;
  v_class_entry_count integer;
  v_show_id uuid;
  v_trial_id uuid;
  v_trial_date date;
  v_judge_id uuid;
  v_judge_capacity record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_waitlist_entry_id::text));

  SELECT *
  INTO v_wl
  FROM waitlist_entries
  WHERE id = p_waitlist_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Waitlist entry not found';
  END IF;

  IF v_wl.status != 'waiting' THEN
    RAISE EXCEPTION 'Waitlist entry is not available for promotion';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_wl.class_id::text));

  SELECT c.max_entries, c.trial_id, t.show_id, t.date
  INTO v_class_limit, v_trial_id, v_show_id, v_trial_date
  FROM classes c
  JOIN trials t ON t.id = c.trial_id
  WHERE c.id = v_wl.class_id
  LIMIT 1;

  IF v_show_id IS NULL OR v_trial_id IS NULL THEN
    RAISE EXCEPTION 'Class/show not found for waitlist entry';
  END IF;

  IF COALESCE(v_class_limit, 0) > 0 THEN
    SELECT COUNT(*)
    INTO v_class_entry_count
    FROM entries e
    WHERE e.class_id = v_wl.class_id
      AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment', 'move-up-requested')
      AND e.deleted_at IS NULL;

    -- MYK9-1012: a spot a cart holds at Pay is taken until the hold ends.
    v_class_entry_count := v_class_entry_count + public.held_spot_count(ARRAY[v_wl.class_id]);

    IF v_class_entry_count >= v_class_limit THEN
      RAISE EXCEPTION 'Class is full';
    END IF;
  END IF;

  FOR v_judge_id IN
    SELECT DISTINCT ja.person_id
    FROM judge_assignments ja
    WHERE ja.class_id = v_wl.class_id
      AND ja.status = 'confirmed'
      AND ja.person_id IS NOT NULL
    ORDER BY ja.person_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)
    );

    SELECT *
    INTO v_judge_capacity
    FROM public.get_judge_day_capacity(v_judge_id, v_show_id, v_trial_date)
    LIMIT 1;

    IF COALESCE(v_judge_capacity.available_spots, 0) <= 0 THEN
      RAISE EXCEPTION 'Judge-day capacity is full';
    END IF;
  END LOOP;

  SELECT GREATEST(
    1,
    COALESCE(p_deadline_hours, s.waitlist_payment_deadline_hours, 48)
  )
  INTO v_deadline_hours
  FROM classes c
  JOIN trials t ON t.id = c.trial_id
  JOIN shows s ON s.id = t.show_id
  WHERE c.id = v_wl.class_id;

  IF v_deadline_hours IS NULL THEN
    RAISE EXCEPTION 'Class/show not found for waitlist entry';
  END IF;

  INSERT INTO entries (dog_id, class_id, show_id, trial_id, entry_status, handler_id)
  VALUES (v_wl.dog_id, v_wl.class_id, v_show_id, v_trial_id, 'pending-payment', v_wl.handler_id)
  RETURNING id INTO v_new_entry_id;

  UPDATE waitlist_entries
  SET status = 'offered',
      promoted_entry_id = v_new_entry_id,
      offered_at = now(),
      offer_expires_at = now() + (v_deadline_hours || ' hours')::interval,
      updated_at = now()
  WHERE id = p_waitlist_entry_id;

  RETURN v_new_entry_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.notify_mail_in_waitlist_head(p_waitlist_entry_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wl public.waitlist_entries%ROWTYPE;
  v_show_id uuid;
  v_club_id uuid;
  v_trial_date date;
  v_class_limit integer;
  v_class_count integer;
  v_class_name text;
  v_dog_name text;
  v_judge_id uuid;
  v_available integer;
  v_recipient record;
  v_sent integer := 0;
  v_marker uuid;
BEGIN
  -- The same lock order as waitlist promotion: row, class, judge/day.
  PERFORM pg_advisory_xact_lock(hashtext(p_waitlist_entry_id::text));
  SELECT * INTO v_wl FROM public.waitlist_entries
  WHERE id = p_waitlist_entry_id FOR UPDATE;
  IF NOT FOUND OR v_wl.status IS DISTINCT FROM 'waiting'
     OR v_wl.joined_via IS DISTINCT FROM 'mail_in' THEN
    RETURN 'not_eligible';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_wl.class_id::text));
  SELECT t.show_id, s.club_id, t.date, c.max_entries,
         coalesce(nullif(btrim(c.name), ''), 'a class'),
         coalesce(nullif(btrim(d.call_name), ''), nullif(btrim(d.name), ''), 'The next dog')
  INTO v_show_id, v_club_id, v_trial_date, v_class_limit, v_class_name, v_dog_name
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  JOIN public.shows s ON s.id = t.show_id
  LEFT JOIN public.dogs d ON d.id = v_wl.dog_id
  WHERE c.id = v_wl.class_id
    AND c.deleted_at IS NULL AND t.deleted_at IS NULL AND s.deleted_at IS NULL
    AND s.waitlist_auto_offer;

  IF NOT FOUND OR public.waitlist_class_trial_has_passed(v_wl.class_id) THEN
    RETURN 'not_eligible';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.waitlist_entries o
    WHERE o.class_id = v_wl.class_id AND o.status = 'offered'
  ) OR EXISTS (
    SELECT 1 FROM public.waitlist_entries earlier
    WHERE earlier.class_id = v_wl.class_id AND earlier.status = 'waiting'
      AND (earlier.position, earlier.id) < (v_wl.position, v_wl.id)
  ) THEN
    RETURN 'not_eligible';
  END IF;

  IF coalesce(v_class_limit, 0) > 0 THEN
    SELECT count(*) INTO v_class_count FROM public.entries e
    WHERE e.class_id = v_wl.class_id
      AND e.entry_status IN (
        'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment', 'move-up-requested'
      )
      AND e.deleted_at IS NULL;
    v_class_count := v_class_count + public.held_spot_count(ARRAY[v_wl.class_id]);
    IF v_class_count >= v_class_limit THEN RETURN 'no_spot'; END IF;
  END IF;

  FOR v_judge_id IN
    SELECT DISTINCT ja.person_id FROM public.judge_assignments ja
    WHERE ja.class_id = v_wl.class_id AND ja.status = 'confirmed'
      AND ja.person_id IS NOT NULL ORDER BY ja.person_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)
    );
    SELECT available_spots INTO v_available
    FROM public.get_judge_day_capacity(v_judge_id, v_show_id, v_trial_date) LIMIT 1;
    IF coalesce(v_available, 0) <= 0 THEN RETURN 'no_spot'; END IF;
  END LOOP;

  FOR v_recipient IN
    WITH staff AS (
      SELECT ur.auth_user_id, r.name AS role_name, min(ur.granted_at) AS granted_at
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE r.name IN ('secretary', 'club_admin')
        AND ur.club_id = v_club_id AND ur.show_id IS NULL AND ur.is_active
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
        AND ur.auth_user_id IS NOT NULL
      GROUP BY ur.auth_user_id, r.name
    )
    SELECT staff.auth_user_id, min(staff.granted_at) AS granted_at FROM staff
    WHERE staff.role_name = 'secretary'
       OR NOT EXISTS (SELECT 1 FROM staff s2 WHERE s2.role_name = 'secretary')
    GROUP BY staff.auth_user_id
    ORDER BY min(staff.granted_at) NULLS LAST, staff.auth_user_id
  LOOP
    INSERT INTO private.waitlist_mail_in_head_notices (waitlist_entry_id, user_id)
    VALUES (p_waitlist_entry_id, v_recipient.auth_user_id)
    ON CONFLICT DO NOTHING RETURNING user_id INTO v_marker;
    IF v_marker IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, type, message, deep_link_url)
    VALUES (
      v_recipient.auth_user_id,
      'waitlist_mail_in_head',
      format('A spot opened in %s. %s is next and joined by mail; offer it from the Waitlist tab.',
             v_class_name, v_dog_name),
      '/shows/' || v_show_id || '/entries?tab=waitlist'
    );
    v_sent := v_sent + 1;
    v_marker := NULL;
  END LOOP;

  IF v_sent > 0 THEN RETURN 'sent'; END IF;
  RETURN 'already_sent_or_no_recipient';
END;
$$;


CREATE OR REPLACE VIEW public.judge_day_summary (
  show_id, judge_id, judge_name, show_date, class_ids, class_names,
  confirmed_count, waitlist_count
)
WITH (security_invoker = true)
AS
SELECT ja.show_id,
    ja.person_id AS judge_id,
    (p.first_name || ' '::text) || p.last_name AS judge_name,
    t.date AS show_date,
    array_agg(DISTINCT c.id) AS class_ids,
    array_agg(DISTINCT c.name) AS class_names,
    count(DISTINCT e.id) FILTER (
      WHERE e.entry_status = ANY (ARRAY[
        'submitted'::text, 'paid'::text, 'confirmed'::text,
        'checked-in'::text, 'competing'::text, 'in-ring'::text,
        'pending-payment'::text,
        'move-up-requested'::text
      ]) AND e.deleted_at IS NULL
    ) + public.manager_held_spot_count(ja.show_id, array_agg(DISTINCT c.id)) AS confirmed_count,
    count(DISTINCT we.id) FILTER (WHERE we.status = 'waiting'::text) AS waitlist_count
FROM public.judge_assignments ja
JOIN public.people p ON p.id = ja.person_id
JOIN public.classes c ON c.id = ja.class_id
JOIN public.trials t ON t.id = c.trial_id
LEFT JOIN public.entries e ON e.class_id = c.id
LEFT JOIN public.waitlist_entries we ON we.class_id = c.id
WHERE ja.status = 'confirmed'::text
GROUP BY ja.show_id, ja.person_id, p.first_name, p.last_name, t.date;

-- Grants restated unchanged (service_role only, as in each source migration), so the
-- grant-decision contract sees a decision beside every replaced function.
REVOKE ALL ON FUNCTION public.class_entry_availability(uuid[], uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_entry_availability(uuid[], uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.get_judge_day_capacity_live(uuid, uuid, date, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_judge_day_capacity_live(uuid, uuid, date, uuid, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.promote_waitlist_entry_internal(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_entry_internal(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.notify_mail_in_waitlist_head(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_mail_in_waitlist_head(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
