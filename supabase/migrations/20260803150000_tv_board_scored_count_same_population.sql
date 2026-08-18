-- MYK9-65 follow-up 2: the board's numerator and denominator must come from the
-- SAME population, or the fix reproduces the bug with different numbers.
--
-- The board renders `{scoredCount} / {totalEntries}`. After 20260803140000 the
-- denominator is the D1 "expected to run" population, but the numerator was
-- still `classes.scored_count`, which `refresh_class_scoring_state` maintains as
--
--   v_scored_count := COUNT(*) FILTER (WHERE is_scored = true)
--
-- with no D1 predicate at all — verified against the live function definition.
-- (The same function computes an expected-count internally using D1, but only
-- persists `scored_count`, so there is no stored column to read instead.)
--
-- An entry scored and only later withdrawn, scratched or pulled therefore stays
-- in the numerator while dropping out of the denominator, and a venue screen can
-- publish "3 / 2". That is strictly worse than the "3 / 0" this issue opened
-- with: an impossible ratio still looks like a real measurement.
--
-- So the count RPC now returns both numbers, derived together. Consistency is
-- structural rather than a coincidence of two triggers agreeing, and the
-- numerator can no longer exceed the denominator.
--
-- `scored_count` here is deliberately `is_scored` only, NOT the D2 "accounted"
-- rule that also counts 'absent'/'excused'. The board is reporting dogs that
-- have RUN, not scoring work that is settled; an absent dog has not run. D2
-- belongs to closeout readiness (MYK9-118), which is a different question.
--
-- The return type gains a column, so this DROPs and recreates rather than
-- CREATE OR REPLACE — which cannot change a RETURNS TABLE shape. Dropping
-- discards the ACL, so the grants are restated below; that is the whole reason
-- they are repeated here rather than assumed.

BEGIN;

DROP FUNCTION IF EXISTS public.tv_class_entry_counts(uuid);

CREATE FUNCTION public.tv_class_entry_counts(p_show_id uuid)
RETURNS TABLE (class_id uuid, entry_count bigint, scored_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    e.class_id,
    count(*)::bigint,
    count(*) FILTER (WHERE e.is_scored IS true)::bigint
  FROM public.entries AS e
  WHERE e.show_id = p_show_id
    AND e.deleted_at IS NULL
    AND e.class_id IS NOT NULL
    AND lower(coalesce(e.entry_status, '')) NOT IN ('scratched', 'withdrawn', 'cancelled')
    AND lower(coalesce(e.check_in_status, '')) IS DISTINCT FROM 'pulled'
    AND EXISTS (
      SELECT 1
      FROM public.shows AS s
      WHERE s.id = p_show_id
        AND s.status IN ('published', 'upcoming', 'in_progress', 'completed')
        AND s.deleted_at IS NULL
    )
  GROUP BY e.class_id;
$$;

REVOKE ALL ON FUNCTION public.tv_class_entry_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_class_entry_counts(uuid) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
