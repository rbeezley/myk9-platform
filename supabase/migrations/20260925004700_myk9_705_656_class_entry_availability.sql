-- =============================================================================
-- MYK9-705 + MYK9-656: one server answer to "can this class still be entered?"
--
-- MYK9-705. The registration wizard counted class and judge-day entries with a
-- direct `entries` read under the exhibitor's RLS, which returns only the
-- exhibitor's own entries. A class filled by other exhibitors read as open: no
-- "Full" chip, no reason, no wait-list offer, until the submit RPC refused it.
--
-- MYK9-656. A recovered cart is rehydrated from a draft of any age, and nothing
-- between that row and Stripe re-checked class closure or fullness. A months-old
-- draft could pay for a class that has since been cancelled, run, or filled.
--
-- Both need the same fact, read independently of who is asking, so this adds
-- ONE server truth and two thin callers of it:
--
--   class_entry_availability(uuid[])      the rule; service_role only. It
--                                         bypasses show visibility, so it is
--                                         never client-callable. stripe-checkout
--                                         reads it to refuse a closed cart line.
--   get_show_class_availability(uuid)     the wizard's read, for authenticated
--                                         callers, gated on the same show
--                                         visibility the judge_assignments and
--                                         armbands SELECT policies use.
--   reconcile_cart_closed_classes(uuid)   the cart owner's atomic drop: in one
--                                         transaction it locks the cart, deletes
--                                         the lines self-service can no longer
--                                         buy, severs the checkout session, and
--                                         returns what it removed and why.
--
-- Every function returns counts and flags only, never another exhibitor's rows.
--
-- WHERE EACH PREDICATE COMES FROM (restated only where it could not be called):
--
--   * Judge-day capacity is not restated at all: it CALLS
--     public.get_judge_day_capacity_live (latest definition
--     20260712200000_entry_capacity_enforcement.sql), the same function
--     evaluate_entry_capacity locks and reads, and takes `available_spots`, the
--     self-service figure (mail-in reserve held back) evaluate_entry_capacity
--     uses for p_submission_source = 'self_service'. A class with several
--     confirmed judges is full when ANY of their days is, as there.
--   * The class count is evaluate_entry_capacity's own COUNT, copied from its
--     LATEST definition (20260712210000_entry_capacity_exhibitor_aware_waitlist_reuse.sql):
--     the same seven entry_status values, deleted_at IS NULL, and
--     `COALESCE(max_entries, 0) > 0 AND count >= max_entries`.
--     evaluate_entry_capacity itself cannot be called: it takes advisory locks
--     and INSERTs wait-list rows. classEntryAvailabilityParity.test.ts pins the
--     status list here to the one in both capacity functions, so a change to
--     either side fails CI instead of drifting.
--   * "Started" is submit_show_entries' `v_class_running` (latest definition
--     20260918211700_myk9_642_day_of_show_entry_flag.sql): any non-deleted
--     entry with is_in_ring or is_scored true.
--   * The closure order (cancelled, then in_progress-or-started, then
--     completed) and its self-service reading are submit_show_entries' guards
--     for a non-official caller, which getClassEntryWindow mirrors client-side.
--     'full' blocks only a class that does not take a wait list, exactly the
--     case evaluate_entry_capacity answers 'denied'. A full class that DOES take
--     a wait list is a legitimate cart line: checkout routes it to the list.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.class_entry_availability(p_class_ids uuid[])
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
      ) AS entry_count,
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
  class_judges AS (
    SELECT DISTINCT r.id AS class_id, ja.person_id, r.show_id, r.trial_date
    FROM requested r
    JOIN public.judge_assignments ja
      ON ja.class_id = r.id
     AND ja.show_id = r.show_id
     AND ja.status = 'confirmed'
     AND ja.person_id IS NOT NULL
  ),
  judge_days AS (
    SELECT d.person_id, d.show_id, d.trial_date, cap.available_spots
    FROM (SELECT DISTINCT person_id, show_id, trial_date FROM class_judges) d
    LEFT JOIN LATERAL public.get_judge_day_capacity_live(
      d.person_id, d.show_id, d.trial_date
    ) cap ON true
  ),
  tightest_judge_day AS (
    -- evaluate_entry_capacity reads COALESCE(available_spots, 0), so a missing
    -- figure is full, never open.
    SELECT DISTINCT ON (cj.class_id)
      cj.class_id,
      cj.person_id,
      COALESCE(jd.available_spots, 0) AS available
    FROM class_judges cj
    LEFT JOIN judge_days jd
      ON jd.person_id = cj.person_id
     AND jd.show_id = cj.show_id
     AND jd.trial_date = cj.trial_date
    ORDER BY cj.class_id, COALESCE(jd.available_spots, 0), cj.person_id
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

COMMENT ON FUNCTION public.class_entry_availability(uuid[]) IS
  'MYK9-705/656: per-class entry counts, started flag, class and judge-day fullness, and the '
  'self-service block (cancelled | started | finished | full | NULL), read independently of '
  'the caller. Counts and flags only. Ignores show visibility, so service_role only; clients '
  'read it through get_show_class_availability or reconcile_cart_closed_classes.';

REVOKE ALL ON FUNCTION public.class_entry_availability(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_entry_availability(uuid[]) TO service_role;


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
    )
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
  'class rather than the rows the caller''s RLS returns. Counts and flags only.';

REVOKE ALL ON FUNCTION public.get_show_class_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_class_availability(uuid) TO authenticated, service_role;


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
BEGIN
  -- Lock the cart so a concurrent reconcile, add, or checkout on the same cart
  -- serialises behind this one. Ownership is the stripe-checkout test: the
  -- cart's exhibitor profile belongs to the caller.
  SELECT ec.status
  INTO v_status
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

  -- Finish Payment lines (entry_id set) settle an entry that already exists.
  -- Removing one would not un-enter the dog, only strand its balance, so
  -- closure never touches them.
  --
  -- No session UPDATE here: trg_cart_item_delete_sever_session already clears
  -- entry_carts.stripe_checkout_session_id on every line delete, inside this
  -- same transaction, so an open Stripe page cannot pay for the old set.
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
      )
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
  'longer buy (class_entry_availability.self_service_block), severs the checkout session, and '
  'returns each dropped line with its reason. Finish Payment lines are never dropped.';

REVOKE ALL ON FUNCTION public.reconcile_cart_closed_classes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_cart_closed_classes(uuid) TO authenticated;

COMMIT;
