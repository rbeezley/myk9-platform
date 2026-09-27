-- =============================================================================
-- MYK9-753: every judge day's real remaining spots, for the cart's pay/wait-list
-- split.
--
-- get_show_class_availability (20260925004700) names ONE judge day per class,
-- the tightest. That is the right verdict for "can this class be entered", but
-- the cart needs more: a line in a class with two confirmed judges takes a spot
-- on BOTH judges' days, and several lines can share a day. With only the
-- tightest day per class the cart could neither see the other day's figure nor
-- count its own lines against it (Codex P1 on the first MYK9-753 branch).
--
-- THE RULE (unchanged, only exposed): a self-service entry into class C is
-- admitted when C's class count is under max_entries AND, for EVERY confirmed
-- judge assignment on C (judge_assignments.status = 'confirmed', person_id not
-- null, same show), that judge's day - keyed (person_id, show_id, trial date),
-- pooling every class the judge has on that date - still has
-- get_judge_day_capacity_live(...).available_spots > 0 (the self-service figure,
-- mail-in reserve held back; a missing figure is 0). Each admitted entry then
-- takes one spot on every one of those days. This is evaluate_entry_capacity's
-- loop (latest definition 20260712210000), which create_online_paid_entry and
-- submit_show_entries both call.
--
-- WHERE IT LIVES NOW:
--
--   class_judge_day_capacity(uuid[])   NEW internal helper, service_role only.
--                                      One row per (class, confirmed judge day)
--                                      with get_judge_day_capacity_live's figures.
--                                      It is the class -> judge-day mapping that
--                                      class_entry_availability restated inline;
--                                      the capacity arithmetic itself stays in
--                                      get_judge_day_capacity_live, called, not
--                                      copied.
--   class_entry_availability(uuid[])   REBUILT to read its tightest day from the
--                                      helper instead of its own inline CTEs.
--                                      Same output, same ordering tie-break.
--                                      Copied from 20260925004700, the LATEST
--                                      migration defining it.
--   get_show_class_judge_day_availability(uuid)
--                                      NEW client read: one row per (class,
--                                      judge day), plus the class's own count and
--                                      self_service_block verdict from
--                                      class_entry_availability. Same visibility
--                                      gate and grants as get_show_class_availability.
--
-- evaluate_entry_capacity keeps its own loop: it must take each judge day's
-- advisory lock BEFORE reading that day, so it cannot read a precomputed set.
-- supabase/tests/myk9_753_class_judge_day_availability_test.sql pins this read
-- to evaluate_entry_capacity's outcome on the same fixture.
--
-- Counts and flags only; no other exhibitor's rows reach the client. The cart's
-- use of this is advisory: payment still decides under evaluate_entry_capacity's
-- locks.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.class_judge_day_capacity(p_class_ids uuid[])
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
      d.person_id, d.show_id, d.trial_date
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

COMMENT ON FUNCTION public.class_judge_day_capacity(uuid[]) IS
  'MYK9-753: one row per (class, confirmed judge day) with get_judge_day_capacity_live''s '
  'capacity, taken, mail-in reserve and self-service remaining (missing = 0). The judge-day '
  'half of the entry-capacity rule, read independently of the caller, so service_role only; '
  'clients read it through get_show_class_judge_day_availability.';

REVOKE ALL ON FUNCTION public.class_judge_day_capacity(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_judge_day_capacity(uuid[]) TO service_role;


-- Rebuilt from 20260925004700_myk9_705_656_class_entry_availability.sql. The
-- only edit: class_judges / judge_days / tightest_judge_day collapse into one
-- tightest_judge_day read of class_judge_day_capacity, keeping the same ORDER BY
-- (fewest spots, then person_id). Grants restated unchanged.
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
  tightest_judge_day AS (
    SELECT DISTINCT ON (d.class_id)
      d.class_id,
      d.judge_id AS person_id,
      d.day_remaining AS available
    FROM public.class_judge_day_capacity(p_class_ids) d
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

REVOKE ALL ON FUNCTION public.class_entry_availability(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_entry_availability(uuid[]) TO service_role;


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
  FROM public.class_entry_availability(ARRAY(SELECT id FROM show_classes)) a
  JOIN show_classes sc ON sc.id = a.class_id
  LEFT JOIN public.class_judge_day_capacity(ARRAY(SELECT id FROM show_classes)) d
    ON d.class_id = a.class_id;
$$;

COMMENT ON FUNCTION public.get_show_class_judge_day_availability(uuid) IS
  'MYK9-753: the cart''s capacity read. One row per (class, confirmed judge day) with that '
  'day''s real self-service remaining spots, plus the class''s count, remaining spots and '
  'self_service_block verdict; a class with no confirmed judge has one row with NULL day '
  'columns. Counts and flags only, gated like get_show_class_availability.';

REVOKE ALL ON FUNCTION public.get_show_class_judge_day_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_class_judge_day_availability(uuid)
  TO authenticated, service_role;

COMMIT;

-- A new client-callable signature: make PostgREST see it.
NOTIFY pgrst, 'reload schema';
