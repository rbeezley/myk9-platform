-- MYK9-1019: one show-wide "Allow wait lists" setting; every class follows it
-- unless the secretary sets that class on its own.
--
-- Before this, classes.allow_waitlist (DEFAULT false) was the only switch,
-- edited class by class in Edit class (MYK9-998). Every reader turned NULL
-- into false. On 2026-10-05 the live database held 36 live classes false, 10
-- NULL and none true (50 more false on soft-deleted classes).
--
-- What changes
--   1. shows.allow_waitlist boolean NOT NULL DEFAULT false. false keeps
--      today's behaviour for every existing show. The Wait List Settings card
--      on the show's Waitlist tab writes it.
--   2. classes.allow_waitlist has no default any more: NULL means "follow the
--      show", true/false is this class's own exception, set or cleared in
--      Edit class. A class created after this follows its show.
--   3. Every explicit false becomes NULL, so existing classes follow their
--      show. With every show at false that changes no decision. Checked
--      read-only against the live database first: no class is true, and the
--      only database objects that read the column are the three functions
--      below and get_show_class_judge_day_availability (which passes
--      class_entry_availability's value through). No trigger, view or
--      constraint reads it. The UPDATE runs as postgres (BYPASSRLS, owner of
--      classes); classes' BEFORE UPDATE triggers bump version and updated_at,
--      so every replica re-reads the rows.
--   4. public.class_allows_waitlist(class_id) is the ONE rule:
--        COALESCE(classes.allow_waitlist, shows.allow_waitlist, false)
--      The client mirror is classAllowsWaitlist() in
--      apps/myk9show/src/utils/classAllowsWaitlist.ts.
--   5. Every database reader decides through it:
--        evaluate_entry_capacity     (submit, paid cart, wait list joins)
--        class_entry_availability    (self_service_block 'full', and the
--                                     allow_waitlist the wizard, the cart and
--                                     the class list read through
--                                     get_show_class_availability /
--                                     get_show_class_judge_day_availability;
--                                     the cart reconcile reads its block)
--        hold_cart_spots             (the allow_waitlist stripe-checkout
--                                     reports on a refused line)
--      Each is copied from its latest definition (20261005031700) with only
--      that expression changed.
--
-- Grants: shows has table-level grants only (anon SELECT, authenticated
-- SELECT/INSERT/UPDATE/DELETE, checked live 2026-10-05) and no column ACLs,
-- so the new column is readable and writable exactly like its neighbours
-- (waitlist_auto_offer, waitlist_payment_deadline_hours) with no column grant.
-- Writes stay governed by the shows UPDATE policy (the show's managers).
-- class_allows_waitlist is SECURITY INVOKER: called inside the SECURITY
-- DEFINER readers it runs as their owner; nobody else may call it.
--
-- Deploy order: this migration, then the site. No edge function changes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The show-wide setting
-- ---------------------------------------------------------------------------
ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS allow_waitlist boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shows.allow_waitlist IS
  'MYK9-1019: "Allow wait lists" for the whole show. Every class whose own allow_waitlist is NULL follows it: when the class or its judge''s day is full, a new entry joins the wait list (true) or is turned away (false). Read through public.class_allows_waitlist(class_id).';

-- ---------------------------------------------------------------------------
-- 2 and 3. Classes follow the show unless set on their own
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes ALTER COLUMN allow_waitlist DROP DEFAULT;

COMMENT ON COLUMN public.classes.allow_waitlist IS
  'MYK9-1019: this class''s own wait-list exception. NULL (the default) follows shows.allow_waitlist; true or false overrides it for this class. Read through public.class_allows_waitlist(class_id), never raw.';

UPDATE public.classes
   SET allow_waitlist = NULL
 WHERE allow_waitlist = false;

-- ---------------------------------------------------------------------------
-- 4. The one rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.class_allows_waitlist(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(c.allow_waitlist, s.allow_waitlist)
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
      JOIN public.shows s ON s.id = t.show_id
      WHERE c.id = p_class_id
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.class_allows_waitlist(uuid) IS
  'MYK9-1019: whether a full class takes wait-list requests: the class''s own allow_waitlist when set, '
  'else its show''s allow_waitlist, else false. The one rule every capacity reader uses; the client '
  'mirror is classAllowsWaitlist(). SECURITY INVOKER, for the SECURITY DEFINER readers only.';

REVOKE ALL ON FUNCTION public.class_allows_waitlist(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_allows_waitlist(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The readers
-- ---------------------------------------------------------------------------

-- From 20261005031700_myk9_1012_hold_spots_at_pay.sql, unchanged but for the
-- returned allow_waitlist, now the effective value (MYK9-1019).
-- Hold a spot for every new line of an active cart, or for none.
--   held      one row per new line, each now holding its spot
--   refused   one row per line with no room (denial_reason NULL) or refused by
--             the entry rule (denial_reason says why); nothing is held
-- No rows: the cart has no new lines (Finish Payment lines already hold their
-- entry's spot).
--   cart_changed  one row, nothing else: the cart is not the cart the caller
--                 read (its updated_at moved, or a reused page is no longer
--                 the one it links). Nothing is held or released.
-- p_expected_updated_at: the cart's updated_at as the caller read it under
-- the lease. p_checkout_session_id: the page these holds are for, when it
-- already exists (a reused page; the cart must still link it); NULL: the page
-- is created next and link_cart_checkout ties the holds to it. An untied hold
-- ends with the lease.
CREATE OR REPLACE FUNCTION public.hold_cart_spots(
  p_cart_id uuid,
  p_lease_id uuid,
  p_expires_at timestamptz,
  p_expected_updated_at timestamptz,
  p_checkout_session_id text DEFAULT NULL
)
RETURNS TABLE (
  outcome text,
  cart_item_id uuid,
  class_id uuid,
  dog_id uuid,
  allow_waitlist boolean,
  denial_reason text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_status text;
  v_updated_at timestamptz;
  v_linked_session text;
  v_lease_until timestamptz;
  v_line record;
  v_capacity record;
  v_hold_id uuid;
  v_expires_at timestamptz;
  v_held uuid[] := ARRAY[]::uuid[];
  v_refused jsonb := '[]'::jsonb;
BEGIN
  IF p_cart_id IS NULL OR p_lease_id IS NULL OR p_expires_at IS NULL
     OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'hold_cart_spots: cart, lease, expiry and the cart''s read stamp are required'
      USING ERRCODE = '22023';
  END IF;
  -- A Stripe Checkout page lives between 30 minutes and 24 hours.
  IF p_expires_at <= now() OR p_expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'hold_cart_spots: expiry % is not within the next 24 hours', p_expires_at
      USING ERRCODE = '22023';
  END IF;

  v_lease_until := public.require_cart_checkout_lease(p_cart_id, p_lease_id);
  -- Not yet tied to a page: it ends with the lease.
  v_expires_at := CASE
    WHEN p_checkout_session_id IS NULL THEN LEAST(p_expires_at, v_lease_until)
    ELSE p_expires_at
  END;

  SELECT c.status, c.updated_at, c.stripe_checkout_session_id
    INTO v_status, v_updated_at, v_linked_session
  FROM public.entry_carts c
  WHERE c.id = p_cart_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hold_cart_spots: cart % not found', p_cart_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'hold_cart_spots: cart % is %, not active', p_cart_id, v_status
      USING ERRCODE = '55000';
  END IF;
  -- The cart this call holds for must be the cart the caller read (Codex P2 on
  -- #2755): an edit from another tab bumps updated_at and severs the page
  -- link, and holds tied to a page the cart no longer links would outlive
  -- end_cart_checkout and block other exhibitors until they expire.
  IF v_updated_at IS DISTINCT FROM p_expected_updated_at
     OR (p_checkout_session_id IS NOT NULL
         AND v_linked_session IS DISTINCT FROM p_checkout_session_id) THEN
    RETURN QUERY SELECT 'cart_changed'::text, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::boolean, NULL::text;
    RETURN;
  END IF;

  -- This Pay replaces any earlier one on the cart. Under the lease no other
  -- checkout is running, so the only page these could belong to is the one
  -- this Pay retired (or is re-holding).
  UPDATE public.cart_spot_holds h
     SET released_at = now(),
         release_reason = 'replaced'
   WHERE h.cart_id = p_cart_id
     AND h.released_at IS NULL;

  FOR v_line IN
    SELECT i.id, i.class_id, i.dog_id, public.class_allows_waitlist(cl.id) AS allow_waitlist
    FROM public.entry_cart_items i
    JOIN public.classes cl ON cl.id = i.class_id
    WHERE i.cart_id = p_cart_id
      AND i.entry_id IS NULL
    ORDER BY i.created_at, i.id
  LOOP
    -- The payment rule itself, under its locks (held until commit). No
    -- exhibitor: a full class answers 'denied' and writes no wait-list row.
    SELECT * INTO v_capacity
    FROM public.evaluate_entry_capacity(
      v_line.class_id, v_line.dog_id, NULL, NULL, 'self_service', false
    );

    IF v_capacity.outcome = 'available' THEN
      INSERT INTO public.cart_spot_holds (
        cart_id, cart_item_id, class_id, stripe_checkout_session_id, expires_at
      )
      VALUES (p_cart_id, v_line.id, v_line.class_id, p_checkout_session_id, v_expires_at)
      RETURNING id INTO v_hold_id;
      v_held := v_held || v_hold_id;
    ELSE
      v_refused := v_refused || jsonb_build_object(
        'cart_item_id', v_line.id,
        'class_id', v_line.class_id,
        'dog_id', v_line.dog_id,
        'allow_waitlist', v_line.allow_waitlist,
        'denial_reason', v_capacity.denial_reason
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_refused) > 0 THEN
    -- All or nothing: a cart that cannot be entered whole holds nothing.
    DELETE FROM public.cart_spot_holds h WHERE h.id = ANY (v_held);
    RETURN QUERY
    SELECT 'refused'::text,
           (r ->> 'cart_item_id')::uuid,
           (r ->> 'class_id')::uuid,
           (r ->> 'dog_id')::uuid,
           (r ->> 'allow_waitlist')::boolean,
           r ->> 'denial_reason'
    FROM jsonb_array_elements(v_refused) AS r;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 'held'::text, h.cart_item_id, h.class_id, i.dog_id,
         public.class_allows_waitlist(cl.id), NULL::text
  FROM public.cart_spot_holds h
  JOIN public.entry_cart_items i ON i.id = h.cart_item_id
  JOIN public.classes cl ON cl.id = h.class_id
  WHERE h.id = ANY (v_held)
  ORDER BY i.created_at, i.id;
END;
$$;

COMMENT ON FUNCTION public.hold_cart_spots(uuid, uuid, timestamptz, timestamptz, text) IS
  'MYK9-1012: under the cart''s checkout lease, hold a spot for every new line under '
  'evaluate_entry_capacity''s locks, or hold nothing and return the refused lines. Replaces '
  'the cart''s earlier holds. service_role only (stripe-checkout).';

REVOKE ALL ON FUNCTION public.hold_cart_spots(uuid, uuid, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_cart_spots(uuid, uuid, timestamptz, timestamptz, text) TO service_role;


-- From 20261005031700_myk9_1012_hold_spots_at_pay.sql, unchanged but for
-- allow_waitlist, now the effective value (MYK9-1019). Its MYK9-1012 note:
-- held spots join entry_count (the taken count every fullness reads), and the
-- exclusion passes through to the judge days.
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
            'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment'
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

COMMENT ON FUNCTION public.class_entry_availability(uuid[], uuid, boolean) IS
  'MYK9-705/656: per-class entry counts, started flag, class and judge-day fullness, and the '
  'self-service block (cancelled | started | finished | full | NULL), read independently of '
  'the caller. Counts and flags only. Ignores show visibility, so service_role only; clients '
  'read it through get_show_class_availability or reconcile_cart_closed_classes. MYK9-1012: '
  'entry_count is the taken count, held spots included except those of '
  'p_exclude_auth_user_id''s carts; p_count_holds => false decides on entries alone (the cart '
  'reconcile and the checkout class gate: a held spot never removes another cart''s line). '
  'MYK9-1019: allow_waitlist is the effective value, class_allows_waitlist(class_id).';

REVOKE ALL ON FUNCTION public.class_entry_availability(uuid[], uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_entry_availability(uuid[], uuid, boolean) TO service_role;


-- From 20261005031700_myk9_1012_hold_spots_at_pay.sql, unchanged but for
-- v_allow_waitlist, now the effective value (MYK9-1019). Its MYK9-1012 note,
-- from 20261004064300_myk9_980_move_up_pending_and_reentry_guards.sql:
-- MYK9-1012: held spots join the class count; the judge days count them
-- through get_judge_day_capacity_live.
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
      'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment'
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
  'the dog was withdrawn or pulled from is denied with denial_reason (MYK9-980). Spots held by '
  'carts at Pay count as taken (MYK9-1012); hold_cart_spots asks this function per line. A full '
  'class takes wait-list requests when class_allows_waitlist says so (MYK9-1019).';


COMMIT;

-- shows gained a column: make PostgREST see it.
NOTIFY pgrst, 'reload schema';
