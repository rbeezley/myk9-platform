-- MYK9-1012: hold class spots while an exhibitor pays, so a paid dog is never
-- turned away for capacity.
--
-- Before this, capacity counted only `entries` rows. A cart held nothing, so
-- two exhibitors could each pay for the last spot and the webhook refused the
-- second one after the charge (denied or wait-listed, then refunded through the
-- cart_overflow request, MYK9-964).
--
-- Now:
--
-- 1. HOLD AT PAY. stripe-checkout calls hold_cart_spots before it creates the
--    Stripe Checkout page, with a fresh ATTEMPT id per Pay (see 3a). Under the
--    cart's row lock it releases the holds of the page this Pay just retired
--    (named by the caller, never guessed), then asks
--    evaluate_entry_capacity, the rule payment itself
--    decides on, about each new line in cart order. evaluate_entry_capacity
--    takes the show, class and judge-day advisory locks and keeps them until
--    this transaction commits, so two Pay clicks for the last spot serialise:
--    the second one reads the first one's hold. Each line with room gets a
--    hold, and the next line counts it. If any line has no room, every hold
--    this call made is removed and the refused lines are returned: nothing is
--    charged, and the exhibitor is told which dog's class filled.
--    evaluate_entry_capacity is called with no exhibitor, so a full class
--    answers 'denied' and never writes a wait-list row here.
--
-- 2. HOLDS COUNT AS TAKEN. held_spot_count (unexpired, unreleased holds) is
--    added to the class count in evaluate_entry_capacity, to the judge day's
--    taken count in get_judge_day_capacity_live, to the class count in
--    class_entry_availability (so every "spots left" and "Full" the wizard and
--    the cart show), and to the waitlist promotion's class count. A client read
--    leaves out the CALLER's own holds (p_exclude_auth_user_id = auth.uid()),
--    so a returning payer never sees their own held spot as Full. Other
--    exhibitors see the spot as taken, never as a hold: no read returns a held
--    count of its own.
--
-- 3. A HOLD ENDS WITH ITS STRIPE PAGE. stripe-checkout creates the page with
--    expires_at = the hold's expiry and then attach_cart_spot_holds sets the
--    hold to the expiry Stripe returned, so the two end at the same instant.
--    Stripe refuses payment on an expired page. Until it is attached a hold
--    lives at most 5 minutes, so an attempt that dies between the hold and
--    the page (a crashed function, a lost response) cannot keep spots for 31.
--
-- 3a. EVERY WRITE IS SCOPED TO ITS ATTEMPT (Codex P1 on #2755). Two Pay
--    requests for the same cart can both hold before either records its page;
--    the one that loses the cart's optimistic update must give back ITS holds
--    only, and an earlier attempt whose Stripe call fails late must not take
--    the newer attempt's holds with it. So each Pay carries an attempt id,
--    stored on its holds, and attach and release touch only that attempt's
--    live holds. attach counts what it tied, and stripe-checkout hands out a
--    page only when that count equals the lines it held; otherwise it expires
--    the page. hold_cart_spots releases only the session the caller names as
--    retired (the cart's previous page, which resolveCheckoutSession has
--    already expired, or the reused page being re-held). Holds of a concurrent
--    attempt are counted, never released: the second of two simultaneous Pays
--    on one cart may be refused, and that is the safe answer.
--
-- 4. RELEASE. A hold stops counting when it expires, and is released early:
--      converted       fulfill_cart_line, just before the line's entry is
--                      created (in the same transaction, under the same locks)
--      replaced        a later hold_cart_spots naming this hold's session as
--                      retired (or re-holding the same reused page)
--      cart_closed     the cart leaves active/fulfilling (submitted, expired,
--                      abandoned, refund_pending)
--      session_ended   the cart's link moves off the session the hold was for
--                      (every cart line edit severs it)
--      checkout_failed stripe-checkout could not open, record or attach the
--                      page (this attempt's holds only)
--    and deleted with the cart line or the cart (ON DELETE CASCADE).
--
-- 5. The cart_overflow refund (MYK9-964) stays the safety net: a payment that
--    lands after its hold ended, or a capacity override at the show desk, can
--    still leave a paid line unserved. Refunds stay human-approved.
--
-- Online only: mail-in and show-desk entries create no holds; they count holds
-- like any other taken spot (the organizer pool keeps its mail-in reserve,
-- because a hold is only ever taken from the self-service spots).
--
-- Signature changes (DROP + CREATE, defaults keep every existing caller):
--   get_judge_day_capacity_live(uuid, uuid, date)  + p_exclude_auth_user_id
--   class_judge_day_capacity(uuid[])               + p_exclude_auth_user_id
--   class_entry_availability(uuid[])               + p_exclude_auth_user_id
--
-- Copied from the LATEST migration that defines each (bodies matched live
-- 2026-10-04), with only the marked MYK9-1012 edits:
--   get_judge_day_capacity_live        20260712200000_entry_capacity_enforcement.sql
--   class_judge_day_capacity           20260925201300_myk9_753_class_judge_day_availability.sql
--   class_entry_availability           20260925201300_myk9_753_class_judge_day_availability.sql
--   get_show_class_judge_day_availability 20260925201300_myk9_753_class_judge_day_availability.sql
--   get_show_class_availability        20260925004700_myk9_705_656_class_entry_availability.sql
--   reconcile_cart_closed_classes      20260925004700_myk9_705_656_class_entry_availability.sql
--   evaluate_entry_capacity            20261004064300_myk9_980_move_up_pending_and_reentry_guards.sql
--   fulfill_cart_line                  20261004214700_myk9_964_replayable_cart_fulfillment.sql
--   promote_waitlist_entry_internal    20260622000222_link_waitlist_promotions.sql
--
-- DEPLOY ORDER: push this migration, then deploy stripe-checkout. The
-- deployed stripe-checkout keeps working against it (it makes no holds, and
-- the class gate's one-argument call still resolves); the new one needs
-- hold_cart_spots. stripe-webhook is unchanged: the conversion is inside
-- fulfill_cart_line.
--
-- Behavioral coverage (runs in CI only):
-- supabase/tests/myk9_1012_hold_spots_at_pay_test.sql

BEGIN;

-- ============================================================================
-- 1. The holds
-- ============================================================================

CREATE TABLE public.cart_spot_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.entry_carts (id) ON DELETE CASCADE,
  cart_item_id uuid NOT NULL REFERENCES public.entry_cart_items (id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  -- The Pay attempt that took the hold; attach and release are scoped to it.
  attempt_id uuid NOT NULL,
  -- NULL between hold_cart_spots and attach_cart_spot_holds.
  stripe_checkout_session_id text,
  -- The Stripe page's own expiry once attached.
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  release_reason text CHECK (
    release_reason IN ('converted', 'replaced', 'cart_closed', 'session_ended', 'checkout_failed')
  ),
  CONSTRAINT cart_spot_holds_release_shape CHECK ((released_at IS NULL) = (release_reason IS NULL))
);

COMMENT ON TABLE public.cart_spot_holds IS
  'MYK9-1012: a class spot held for one cart line from the Pay click until its Stripe Checkout '
  'page expires. An unreleased, unexpired hold counts as a taken spot everywhere capacity is '
  'counted (held_spot_count). service_role only; written through hold_cart_spots, '
  'attach_cart_spot_holds and release_cart_spot_holds.';

CREATE INDEX cart_spot_holds_cart_id_idx ON public.cart_spot_holds (cart_id);
CREATE INDEX cart_spot_holds_cart_item_id_idx ON public.cart_spot_holds (cart_item_id);
CREATE INDEX cart_spot_holds_class_id_idx ON public.cart_spot_holds (class_id);
-- One hold per (attempt, cart line). Two attempts on one cart may each hold
-- the same line while both are in flight; both count.
CREATE UNIQUE INDEX cart_spot_holds_attempt_line_key
  ON public.cart_spot_holds (attempt_id, cart_item_id);

ALTER TABLE public.cart_spot_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_spot_holds FORCE ROW LEVEL SECURITY;

-- REQUIRED, not tidy-up: ALTER DEFAULT PRIVILEGES grant anon full CRUD on
-- every new public table. No client role reads or writes holds; a hold
-- reaches a client only as part of a taken count.
REVOKE ALL ON TABLE public.cart_spot_holds FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cart_spot_holds TO service_role;

-- The count every capacity rule adds. p_exclude_auth_user_id leaves out the
-- holds of carts that account owns (a client read about the caller's own
-- checkout); NULL counts every hold.
CREATE OR REPLACE FUNCTION public.held_spot_count(
  p_class_ids uuid[],
  p_exclude_auth_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.cart_spot_holds h
  WHERE h.class_id = ANY (p_class_ids)
    AND h.released_at IS NULL
    AND h.expires_at > now()
    AND (
      p_exclude_auth_user_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.entry_carts c
        JOIN public.exhibitor_profiles ep ON ep.id = c.exhibitor_id
        WHERE c.id = h.cart_id
          AND ep.auth_user_id = p_exclude_auth_user_id
      )
    );
$$;

COMMENT ON FUNCTION public.held_spot_count(uuid[], uuid) IS
  'MYK9-1012: unexpired, unreleased cart spot holds in the given classes, optionally leaving out '
  'the holds of one account''s carts. Added to every capacity count. service_role only.';

REVOKE ALL ON FUNCTION public.held_spot_count(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.held_spot_count(uuid[], uuid) TO service_role;

-- ============================================================================
-- 2. Hold, attach, release (stripe-checkout; service_role only)
-- ============================================================================

-- Hold a spot for every new line of an active cart, or for none, for one Pay
-- attempt.
--   held      one row per new line, each now holding its spot
--   refused   one row per line with no room (denial_reason NULL) or refused by
--             the entry rule (denial_reason says why); nothing is held
-- No rows: the cart has no new lines (Finish Payment lines already hold their
-- entry's spot).
-- p_checkout_session_id: the page these holds are for, when it already exists
--   (a reused page). NULL: the page is created next; the hold then lives at
--   most 5 minutes until attach_cart_spot_holds ties it to the page.
-- p_release_session_id: a page the caller has retired (expired, or is
--   re-holding); its live holds are released first. Nothing else is.
CREATE OR REPLACE FUNCTION public.hold_cart_spots(
  p_cart_id uuid,
  p_attempt_id uuid,
  p_expires_at timestamptz,
  p_checkout_session_id text DEFAULT NULL,
  p_release_session_id text DEFAULT NULL
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
  v_line record;
  v_capacity record;
  v_hold_id uuid;
  v_expires_at timestamptz;
  v_held uuid[] := ARRAY[]::uuid[];
  v_refused jsonb := '[]'::jsonb;
BEGIN
  IF p_cart_id IS NULL OR p_attempt_id IS NULL OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'hold_cart_spots: cart, attempt and expiry are required'
      USING ERRCODE = '22023';
  END IF;
  -- A Stripe Checkout page lives between 30 minutes and 24 hours.
  IF p_expires_at <= now() OR p_expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'hold_cart_spots: expiry % is not within the next 24 hours', p_expires_at
      USING ERRCODE = '22023';
  END IF;
  -- Not yet tied to a page: short-lived until attach_cart_spot_holds.
  v_expires_at := CASE
    WHEN p_checkout_session_id IS NULL THEN LEAST(p_expires_at, now() + interval '5 minutes')
    ELSE p_expires_at
  END;

  SELECT c.status INTO v_status
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

  -- Only a page the caller has retired gives its spots back here. A
  -- concurrent attempt's holds are counted below, never released.
  UPDATE public.cart_spot_holds h
     SET released_at = now(),
         release_reason = 'replaced'
   WHERE h.cart_id = p_cart_id
     AND h.released_at IS NULL
     AND p_release_session_id IS NOT NULL
     AND h.stripe_checkout_session_id = p_release_session_id;
  -- A repeated call by the same attempt starts over.
  DELETE FROM public.cart_spot_holds h
   WHERE h.attempt_id = p_attempt_id
     AND h.cart_id = p_cart_id;

  FOR v_line IN
    SELECT i.id, i.class_id, i.dog_id, COALESCE(cl.allow_waitlist, false) AS allow_waitlist
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
        cart_id, cart_item_id, class_id, attempt_id, stripe_checkout_session_id, expires_at
      )
      VALUES (
        p_cart_id, v_line.id, v_line.class_id, p_attempt_id, p_checkout_session_id, v_expires_at
      )
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
         COALESCE(cl.allow_waitlist, false), NULL::text
  FROM public.cart_spot_holds h
  JOIN public.entry_cart_items i ON i.id = h.cart_item_id
  JOIN public.classes cl ON cl.id = h.class_id
  WHERE h.id = ANY (v_held)
  ORDER BY i.created_at, i.id;
END;
$$;

COMMENT ON FUNCTION public.hold_cart_spots(uuid, uuid, timestamptz, text, text) IS
  'MYK9-1012: at Pay, hold a spot for every new line of an active cart for one attempt, under '
  'evaluate_entry_capacity''s locks, or hold nothing and return the refused lines. Releases only '
  'the holds of the session the caller names as retired. service_role only (stripe-checkout).';

REVOKE ALL ON FUNCTION public.hold_cart_spots(uuid, uuid, timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_cart_spots(uuid, uuid, timestamptz, text, text)
  TO service_role;

-- Tie ONE attempt's live, unexpired holds to the Stripe page the cart now
-- links, ending exactly when the page does. Returns the number tied; the
-- caller hands the page out only when that is every line it held.
CREATE OR REPLACE FUNCTION public.attach_cart_spot_holds(
  p_cart_id uuid,
  p_attempt_id uuid,
  p_checkout_session_id text,
  p_expires_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_session text;
  v_count integer;
BEGIN
  IF p_cart_id IS NULL OR p_attempt_id IS NULL OR p_checkout_session_id IS NULL
     OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'attach_cart_spot_holds: cart, attempt, session and expiry are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.status, c.stripe_checkout_session_id INTO v_status, v_session
  FROM public.entry_carts c
  WHERE c.id = p_cart_id
  FOR UPDATE;
  IF NOT FOUND OR v_status IS DISTINCT FROM 'active'
     OR v_session IS DISTINCT FROM p_checkout_session_id THEN
    RAISE EXCEPTION 'attach_cart_spot_holds: cart % is not active on session %',
      p_cart_id, p_checkout_session_id
      USING ERRCODE = '55000';
  END IF;

  -- An expired hold is not revived: its spot may already be someone else's.
  UPDATE public.cart_spot_holds h
     SET stripe_checkout_session_id = p_checkout_session_id,
         expires_at = p_expires_at
   WHERE h.cart_id = p_cart_id
     AND h.attempt_id = p_attempt_id
     AND h.released_at IS NULL
     AND h.expires_at > now()
     AND (h.stripe_checkout_session_id IS NULL
          OR h.stripe_checkout_session_id = p_checkout_session_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.attach_cart_spot_holds(uuid, uuid, text, timestamptz) IS
  'MYK9-1012: ties one Pay attempt''s live holds to the Checkout Session the cart links and sets '
  'their expiry to the session''s, so hold and page end together. Returns the count tied. '
  'service_role only.';

REVOKE ALL ON FUNCTION public.attach_cart_spot_holds(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_cart_spot_holds(uuid, uuid, text, timestamptz)
  TO service_role;

-- stripe-checkout could not open, record or attach the page: give back THIS
-- attempt's spots, never another attempt's.
CREATE OR REPLACE FUNCTION public.release_cart_spot_holds(
  p_cart_id uuid,
  p_attempt_id uuid,
  p_reason text DEFAULT 'checkout_failed'
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_cart_id IS NULL OR p_attempt_id IS NULL OR p_reason IS DISTINCT FROM 'checkout_failed' THEN
    RAISE EXCEPTION 'release_cart_spot_holds: a cart, an attempt and the reason checkout_failed are required'
      USING ERRCODE = '22023';
  END IF;
  UPDATE public.cart_spot_holds h
     SET released_at = now(),
         release_reason = p_reason
   WHERE h.cart_id = p_cart_id
     AND h.attempt_id = p_attempt_id
     AND h.released_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.release_cart_spot_holds(uuid, uuid, text) IS
  'MYK9-1012: releases one Pay attempt''s live holds when stripe-checkout could not open, record '
  'or attach its Stripe page. service_role only.';

REVOKE ALL ON FUNCTION public.release_cart_spot_holds(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cart_spot_holds(uuid, uuid, text) TO service_role;

-- A cart that leaves checkout gives its spots back: closed (submitted,
-- expired, abandoned, refund_pending) releases every hold; a link that moves
-- off a session releases that session's holds.
CREATE OR REPLACE FUNCTION public.entry_carts_release_spot_holds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' AND NEW.status IS DISTINCT FROM 'fulfilling' THEN
    UPDATE public.cart_spot_holds h
       SET released_at = now(),
           release_reason = 'cart_closed'
     WHERE h.cart_id = NEW.id
       AND h.released_at IS NULL;
  ELSIF NEW.status = 'active'
        AND OLD.stripe_checkout_session_id IS NOT NULL
        AND NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id THEN
    UPDATE public.cart_spot_holds h
       SET released_at = now(),
           release_reason = 'session_ended'
     WHERE h.cart_id = NEW.id
       AND h.released_at IS NULL
       AND h.stripe_checkout_session_id = OLD.stripe_checkout_session_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.entry_carts_release_spot_holds() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_entry_carts_release_spot_holds
  AFTER UPDATE OF status, stripe_checkout_session_id ON public.entry_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.entry_carts_release_spot_holds();

-- ============================================================================
-- 3. Holds count as taken
-- ============================================================================

-- Signature change: drop the old shapes first. Defaults keep every existing
-- positional caller resolving.
DROP FUNCTION public.class_entry_availability(uuid[]);
DROP FUNCTION public.class_judge_day_capacity(uuid[]);
DROP FUNCTION public.get_judge_day_capacity_live(uuid, uuid, date);

-- From 20260712200000_entry_capacity_enforcement.sql. MYK9-1012: + the
-- exclusion parameter, and held spots join the taken count.
CREATE OR REPLACE FUNCTION public.get_judge_day_capacity_live(
  p_judge_id uuid,
  p_show_id uuid,
  p_date date,
  p_exclude_auth_user_id uuid DEFAULT NULL
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
      v_reserved := GREATEST(0, FLOOR(v_capacity * COALESCE(v_mail_in_value, 0) / 100.0));
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO v_confirmed
  FROM public.entries e
  WHERE e.class_id = ANY(v_class_ids)
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment')
    AND e.deleted_at IS NULL;

  -- MYK9-1012: a spot a cart holds at Pay is taken until the hold ends.
  v_confirmed := v_confirmed + public.held_spot_count(v_class_ids, p_exclude_auth_user_id);

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

REVOKE ALL ON FUNCTION public.get_judge_day_capacity_live(uuid, uuid, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_judge_day_capacity_live(uuid, uuid, date, uuid)
  TO service_role;

-- From 20260925201300_myk9_753_class_judge_day_availability.sql. MYK9-1012:
-- passes the exclusion through to get_judge_day_capacity_live.
CREATE OR REPLACE FUNCTION public.class_judge_day_capacity(
  p_class_ids uuid[],
  p_exclude_auth_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  class_id uuid,
  judge_id uuid,
  show_date date,
  day_capacity integer,
  day_taken integer,
  day_mail_in_reserved integer,
  day_remaining integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH class_judges AS (
    -- evaluate_entry_capacity's judge set: confirmed, named, same show.
    SELECT DISTINCT c.id AS class_id, ja.person_id, t.show_id, t.date AS trial_date
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    JOIN public.judge_assignments ja
      ON ja.class_id = c.id
     AND ja.show_id = t.show_id
     AND ja.status = 'confirmed'
     AND ja.person_id IS NOT NULL
    WHERE c.id = ANY (p_class_ids)
  ),
  judge_days AS (
    SELECT
      d.person_id,
      d.show_id,
      d.trial_date,
      cap.capacity,
      cap.confirmed_count,
      cap.mail_in_reserved,
      cap.available_spots
    FROM (SELECT DISTINCT person_id, show_id, trial_date FROM class_judges) d
    LEFT JOIN LATERAL public.get_judge_day_capacity_live(
      d.person_id, d.show_id, d.trial_date, p_exclude_auth_user_id
    ) cap ON true
  )
  SELECT
    cj.class_id,
    cj.person_id,
    cj.trial_date,
    jd.capacity,
    jd.confirmed_count,
    jd.mail_in_reserved,
    -- evaluate_entry_capacity reads COALESCE(available_spots, 0) for
    -- self-service, so a missing figure is full, never open.
    COALESCE(jd.available_spots, 0)
  FROM class_judges cj
  LEFT JOIN judge_days jd
    ON jd.person_id = cj.person_id
   AND jd.show_id = cj.show_id
   AND jd.trial_date = cj.trial_date;
$$;

COMMENT ON FUNCTION public.class_judge_day_capacity(uuid[], uuid) IS
  'MYK9-753: one row per (class, confirmed judge day) with get_judge_day_capacity_live''s '
  'capacity, taken, mail-in reserve and self-service remaining (missing = 0). The judge-day '
  'half of the entry-capacity rule, read independently of the caller, so service_role only; '
  'clients read it through get_show_class_judge_day_availability. MYK9-1012: taken includes '
  'held spots, except those of p_exclude_auth_user_id''s carts.';

REVOKE ALL ON FUNCTION public.class_judge_day_capacity(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_judge_day_capacity(uuid[], uuid) TO service_role;

-- From 20260925201300_myk9_753_class_judge_day_availability.sql. MYK9-1012:
-- held spots join entry_count (the taken count every fullness reads), and the
-- exclusion passes through to the judge days.
CREATE OR REPLACE FUNCTION public.class_entry_availability(
  p_class_ids uuid[],
  p_exclude_auth_user_id uuid DEFAULT NULL
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
      COALESCE(c.allow_waitlist, false) AS allow_waitlist,
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
      + public.held_spot_count(ARRAY[r.id], p_exclude_auth_user_id) AS entry_count,
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
    FROM public.class_judge_day_capacity(p_class_ids, p_exclude_auth_user_id) d
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

COMMENT ON FUNCTION public.class_entry_availability(uuid[], uuid) IS
  'MYK9-705/656: per-class entry counts, started flag, class and judge-day fullness, and the '
  'self-service block (cancelled | started | finished | full | NULL), read independently of '
  'the caller. Counts and flags only. Ignores show visibility, so service_role only; clients '
  'read it through get_show_class_availability or reconcile_cart_closed_classes. MYK9-1012: '
  'entry_count is the taken count, held spots included except those of '
  'p_exclude_auth_user_id''s carts.';

REVOKE ALL ON FUNCTION public.class_entry_availability(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_entry_availability(uuid[], uuid) TO service_role;

-- From 20260925201300_myk9_753_class_judge_day_availability.sql. MYK9-1012:
-- the caller's own holds are left out of both reads.
CREATE OR REPLACE FUNCTION public.get_show_class_judge_day_availability(p_show_id uuid)
RETURNS TABLE (
  class_id uuid,
  class_max_entries integer,
  class_entry_count integer,
  class_remaining integer,
  class_full boolean,
  allow_waitlist boolean,
  self_service_block text,
  judge_id uuid,
  show_date date,
  day_capacity integer,
  day_taken integer,
  day_mail_in_reserved integer,
  day_remaining integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- The visibility gate is get_show_class_availability's, verbatim: a
  -- non-deleted show that is publicly visible, or a site admin, a show manager
  -- or a show official. A show the caller cannot see returns no rows, which the
  -- cart reports as unreadable, never as open.
  WITH show_classes AS (
    SELECT c.id, c.max_entries
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    WHERE t.show_id = p_show_id
      AND EXISTS (
        SELECT 1
        FROM public.shows s
        WHERE s.id = p_show_id
          AND s.deleted_at IS NULL
          AND (
            s.status = ANY (ARRAY['published', 'upcoming', 'in_progress', 'completed'])
            OR public.is_site_admin()
            OR public.can_manage_show(p_show_id)
            OR public.is_show_official(p_show_id)
          )
      )
  )
  SELECT
    a.class_id,
    sc.max_entries,
    a.entry_count,
    -- The spots class_full is decided on: NULL when the class has no limit
    -- (COALESCE(max_entries, 0) = 0), as evaluate_entry_capacity reads it.
    CASE
      WHEN COALESCE(sc.max_entries, 0) > 0 THEN GREATEST(0, sc.max_entries - a.entry_count)
    END,
    a.class_full,
    a.allow_waitlist,
    a.self_service_block,
    d.judge_id,
    d.show_date,
    d.day_capacity,
    d.day_taken,
    d.day_mail_in_reserved,
    d.day_remaining
  FROM public.class_entry_availability(ARRAY(SELECT id FROM show_classes), auth.uid()) a
  JOIN show_classes sc ON sc.id = a.class_id
  LEFT JOIN public.class_judge_day_capacity(ARRAY(SELECT id FROM show_classes), auth.uid()) d
    ON d.class_id = a.class_id;
$$;

COMMENT ON FUNCTION public.get_show_class_judge_day_availability(uuid) IS
  'MYK9-753: the cart''s capacity read. One row per (class, confirmed judge day) with that '
  'day''s real self-service remaining spots, plus the class''s count, remaining spots and '
  'self_service_block verdict; a class with no confirmed judge has one row with NULL day '
  'columns. Counts and flags only, gated like get_show_class_availability. MYK9-1012: held '
  'spots count as taken, except the caller''s own.';

REVOKE ALL ON FUNCTION public.get_show_class_judge_day_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_class_judge_day_availability(uuid)
  TO authenticated, service_role;

-- From 20260925004700_myk9_705_656_class_entry_availability.sql. MYK9-1012:
-- the caller's own holds are left out.
CREATE OR REPLACE FUNCTION public.get_show_class_availability(p_show_id uuid)
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
  -- The visibility arms are the authenticated SELECT policy on
  -- judge_assignments / armbands (20260912154500): a publicly visible show, or
  -- a site admin, a show manager, or a show official. A show the caller cannot
  -- see returns no rows, which the wizard reports as unreadable, never as open.
  SELECT a.*
  FROM public.class_entry_availability(
    ARRAY(
      SELECT c.id
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
      WHERE t.show_id = p_show_id
    ),
    auth.uid()
  ) a
  WHERE EXISTS (
    SELECT 1
    FROM public.shows s
    WHERE s.id = p_show_id
      AND s.deleted_at IS NULL
      AND (
        s.status = ANY (ARRAY['published', 'upcoming', 'in_progress', 'completed'])
        OR public.is_site_admin()
        OR public.can_manage_show(p_show_id)
        OR public.is_show_official(p_show_id)
      )
  );
$$;

COMMENT ON FUNCTION public.get_show_class_availability(uuid) IS
  'MYK9-705: the registration wizard''s class availability, counted over every entry in the '
  'class rather than the rows the caller''s RLS returns. Counts and flags only. MYK9-1012: held '
  'spots count as taken, except the caller''s own.';

REVOKE ALL ON FUNCTION public.get_show_class_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_class_availability(uuid) TO authenticated, service_role;

-- From 20260925004700_myk9_705_656_class_entry_availability.sql. MYK9-1012:
-- the owner's own holds do not make their own lines look full.
CREATE OR REPLACE FUNCTION public.reconcile_cart_closed_classes(p_cart_id uuid)
RETURNS TABLE (
  item_id uuid,
  class_id uuid,
  dog_id uuid,
  reason text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_status text;
  v_session_id text;
BEGIN
  -- Lock the cart so a concurrent reconcile, add, or checkout on the same cart
  -- serialises behind this one. Ownership is the stripe-checkout test: the
  -- cart's exhibitor profile belongs to the caller.
  SELECT ec.status, ec.stripe_checkout_session_id
  INTO v_status, v_session_id
  FROM public.entry_carts ec
  JOIN public.exhibitor_profiles ep ON ep.id = ec.exhibitor_id
  WHERE ec.id = p_cart_id
    AND ep.auth_user_id = auth.uid()
  FOR UPDATE OF ec;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cart % not found', p_cart_id
      USING ERRCODE = '42501';
  END IF;

  -- Submitted and abandoned carts are terminal; there is nothing to buy.
  IF v_status NOT IN ('active', 'expired') THEN
    RETURN;
  END IF;

  -- A cart that still links a Checkout Session is left alone. The page may be
  -- open, or paid with the webhook not yet run: deleting lines here would only
  -- sever the link, not stop the charge, and the webhook would then reject a
  -- payment already taken. stripe-checkout's class gate resolves the session
  -- (expires an open one, waits out a complete one) and clears the link; the
  -- next reconcile then drops the lines and says why.
  IF v_session_id IS NOT NULL THEN
    RETURN;
  END IF;

  -- Finish Payment lines (entry_id set) settle an entry that already exists.
  -- Removing one would not un-enter the dog, only strand its balance, so
  -- closure never touches them.
  RETURN QUERY
  WITH blocked AS (
    SELECT i.id, a.self_service_block
    FROM public.entry_cart_items i
    JOIN public.class_entry_availability(
      ARRAY(
        SELECT DISTINCT ci.class_id
        FROM public.entry_cart_items ci
        WHERE ci.cart_id = p_cart_id
          AND ci.entry_id IS NULL
      ),
      auth.uid()
    ) a ON a.class_id = i.class_id
    WHERE i.cart_id = p_cart_id
      AND i.entry_id IS NULL
      AND a.self_service_block IS NOT NULL
  ),
  removed AS (
    DELETE FROM public.entry_cart_items i
    USING blocked b
    WHERE i.id = b.id
    RETURNING i.id, i.class_id, i.dog_id
  )
  SELECT r.id, r.class_id, r.dog_id, b.self_service_block
  FROM removed r
  JOIN blocked b ON b.id = r.id;
END;
$$;

COMMENT ON FUNCTION public.reconcile_cart_closed_classes(uuid) IS
  'MYK9-656: atomically drops a caller-owned cart''s lines whose class self-service can no '
  'longer buy (class_entry_availability.self_service_block) and returns each dropped line with '
  'its reason. Finish Payment lines are never dropped, and a cart still linked to a Checkout '
  'Session is left untouched until stripe-checkout retires the session. MYK9-1012: the '
  'caller''s own held spots never make their own lines look full.';

REVOKE ALL ON FUNCTION public.reconcile_cart_closed_classes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_cart_closed_classes(uuid) TO authenticated;

-- From 20261004064300_myk9_980_move_up_pending_and_reentry_guards.sql.
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
  'carts at Pay count as taken (MYK9-1012); hold_cart_spots asks this function per line.';

-- From 20261004214700_myk9_964_replayable_cart_fulfillment.sql. MYK9-1012:
-- the line's own hold is released just before its entry is created, in the
-- same transaction, so the spot passes from the hold to the entry under
-- evaluate_entry_capacity's locks without being counted twice.
CREATE OR REPLACE FUNCTION public.fulfill_cart_line(
  p_session_id text,
  p_cart_item_id uuid
)
RETURNS TABLE (
  outcome text,
  entry_id uuid,
  waitlist_entry_id uuid,
  error_message text,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_run public.cart_fulfillments%ROWTYPE;
  v_line public.cart_fulfillment_lines%ROWTYPE;
  v_created record;
  v_outcome text;
  v_entry uuid;
  v_waitlist uuid;
  v_error text;
BEGIN
  SELECT * INTO v_run
    FROM public.cart_fulfillments f
   WHERE f.stripe_checkout_session_id = p_session_id;
  -- The line's row lock serialises two deliveries working the same line.
  SELECT * INTO v_line
    FROM public.cart_fulfillment_lines l
   WHERE l.stripe_checkout_session_id = p_session_id
     AND l.cart_item_id = p_cart_item_id
   FOR UPDATE;
  IF v_run.stripe_checkout_session_id IS NULL OR v_line.cart_item_id IS NULL THEN
    RAISE EXCEPTION 'fulfill_cart_line: no line % in session %', p_cart_item_id, p_session_id
      USING errcode = 'P0002';
  END IF;

  IF v_line.outcome IS NOT NULL THEN
    RETURN QUERY SELECT v_line.outcome, v_line.entry_id, v_line.waitlist_entry_id,
      v_line.error_message, true;
    RETURN;
  END IF;

  IF v_line.existing_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'fulfill_cart_line: line % pays an existing entry; record it with record_cart_line_outcome',
      p_cart_item_id
      USING errcode = '22023';
  END IF;

  -- MYK9-1012: this line's hold becomes its entry. Released here, not after:
  -- evaluate_entry_capacity counts every live hold, and this one is the spot
  -- the line is about to take. A transient error below rolls it back.
  UPDATE public.cart_spot_holds h
     SET released_at = now(),
         release_reason = 'converted'
   WHERE h.cart_item_id = p_cart_item_id
     AND h.released_at IS NULL;

  BEGIN
    SELECT * INTO v_created
      FROM public.create_online_paid_entry(
        v_line.dog_id,
        v_line.class_id,
        v_line.handler_id,
        v_line.line_amount_cents / 100.0,
        v_line.jump_height,
        v_line.special_requests,
        v_run.stripe_payment_intent_id,
        v_run.created_at,
        v_run.show_id,
        v_line.trial_id,
        v_run.exhibitor_id,
        v_line.junior_fee_declared
      ) AS x;
    IF v_created.outcome = 'created_entry' AND v_created.entry_id IS NOT NULL THEN
      v_outcome := 'created_entry';
      v_entry := v_created.entry_id;
    ELSIF v_created.outcome = 'waitlisted' AND v_created.waitlist_entry_id IS NOT NULL THEN
      v_outcome := 'waitlisted';
      v_waitlist := v_created.waitlist_entry_id;
    ELSIF v_created.outcome = 'denied' THEN
      v_outcome := 'denied';
    ELSE
      v_outcome := 'failed';
      v_error := 'create_online_paid_entry returned no usable outcome ('
        || COALESCE(v_created.outcome, 'none') || ')';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Transient classes: transaction rollback (serialization, deadlock),
    -- connection, insufficient resources, operator intervention, system and
    -- internal errors, and a lock that could not be taken. Nothing is
    -- recorded; the redelivery works the line again.
    IF left(SQLSTATE, 2) IN ('08', '40', '53', '57', '58', 'XX') OR SQLSTATE = '55P03' THEN
      RAISE;
    END IF;
    v_outcome := 'failed';
    v_error := SQLSTATE || ': ' || SQLERRM;
  END;

  UPDATE public.cart_fulfillment_lines l
     SET outcome = v_outcome,
         entry_id = v_entry,
         paid_entry_id = v_entry,
         waitlist_entry_id = v_waitlist,
         error_message = v_error,
         resolved_at = now()
   WHERE l.stripe_checkout_session_id = p_session_id
     AND l.cart_item_id = p_cart_item_id;

  RETURN QUERY SELECT v_outcome, v_entry, v_waitlist, v_error, false;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_cart_line(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_cart_line(text, uuid) TO service_role;

-- From 20260622000222_link_waitlist_promotions.sql (its only definition; its
-- search_path is kept). MYK9-1012: held spots join the class count, so a
-- spot a cart is paying for is never offered to the wait list; the judge days
-- count them through get_judge_day_capacity.
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
      AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment')
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

REVOKE ALL ON FUNCTION public.promote_waitlist_entry_internal(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_entry_internal(uuid, integer) TO service_role;

COMMIT;

-- New and changed client-callable signatures: make PostgREST see them.
NOTIFY pgrst, 'reload schema';
