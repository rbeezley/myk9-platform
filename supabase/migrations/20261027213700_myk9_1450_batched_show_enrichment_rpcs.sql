-- MYK9-1450: batched forms of the two per-show class-enrichment RPCs.
--
-- Class replication enriches every synced class with judge names
-- (get_show_judges) and official hide counts (get_show_class_hide_counts),
-- one call per SHOW in the batch. A device with a cold replica (a new
-- browser, a cleared site, every end-to-end test context) syncs every visible
-- class, so it paid 2 x (shows on the platform) round trips: 30 today, and a
-- number that grows with every show added. On 2026-10-27 the demo exhibitor
-- made 8,659 get_show_judges calls in under two hours, and anonymous visitors
-- about 3,000 each.
--
-- These take a list of show ids and return the same rows tagged with the
-- show they belong to, so a sync pass costs two calls whatever its size.
--
-- AUTHORIZATION IS UNCHANGED BY CONSTRUCTION. Each function is SECURITY
-- INVOKER and calls the existing SECURITY DEFINER function once per show, so
-- every row passes exactly the gate that function applies (show status and
-- manager checks for judges; show role and judge assignment for hide counts).
-- Nothing here restates or widens a predicate. The caller must already hold
-- EXECUTE on the per-show function, which anon and authenticated do.
--
-- The list is capped so one request cannot fan out without bound inside the
-- database; the client sends at most CLASS_ENRICHMENT_SHOW_BATCH ids a call.

CREATE OR REPLACE FUNCTION public.get_shows_judges(p_show_ids uuid[])
RETURNS TABLE(
  show_id uuid,
  assignment_id uuid,
  person_id uuid,
  first_name text,
  last_name text,
  trial_id uuid,
  class_id uuid,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(cardinality(p_show_ids), 0) > 200 THEN
    RAISE EXCEPTION 'get_shows_judges: at most 200 show ids per call (got %)',
      cardinality(p_show_ids)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    ids.id,
    j.assignment_id,
    j.person_id,
    j.first_name,
    j.last_name,
    j.trial_id,
    j.class_id,
    j.status
  FROM (SELECT DISTINCT u.id FROM unnest(p_show_ids) AS u(id) WHERE u.id IS NOT NULL) AS ids
  CROSS JOIN LATERAL public.get_show_judges(ids.id) AS j;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shows_class_hide_counts(p_show_ids uuid[])
RETURNS TABLE(show_id uuid, class_id uuid, num_hides integer)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(cardinality(p_show_ids), 0) > 200 THEN
    RAISE EXCEPTION 'get_shows_class_hide_counts: at most 200 show ids per call (got %)',
      cardinality(p_show_ids)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT ids.id, h.class_id, h.num_hides
  FROM (SELECT DISTINCT u.id FROM unnest(p_show_ids) AS u(id) WHERE u.id IS NOT NULL) AS ids
  CROSS JOIN LATERAL public.get_show_class_hide_counts(ids.id) AS h;
END;
$$;

-- Same callers as the per-show functions (both anon- and authenticated-
-- executable, see 20260830240000 for hide counts). Functions are granted to
-- PUBLIC by default, so revoke that first.
REVOKE ALL ON FUNCTION public.get_shows_judges(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shows_class_hide_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shows_judges(uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_shows_class_hide_counts(uuid[])
  TO anon, authenticated, service_role;
