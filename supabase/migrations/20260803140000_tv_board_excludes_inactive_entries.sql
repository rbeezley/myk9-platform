-- MYK9-65 follow-up: the TV board must apply the SAME "expected to run" rule the
-- server uses, not a looser one of its own.
--
-- 20260803130000 filtered only entries.deleted_at, even though its own comment
-- claimed withdrawn entries must not ride the running order. Live rows carrying
-- entry_status 'withdrawn' / 'scratched' / 'cancelled', or check_in_status
-- 'pulled', therefore stayed in the public queue and inflated the totals beside
-- it. On the seeded Heartland show that is 2 of 514 live entries — small, but it
-- reintroduces exactly the count-disagreement this issue exists to end.
--
-- The rule is not invented here. It is decision D1 of
-- 20260712180000_class_status_auto_derivation.sql, which the server uses to
-- auto-derive class completion, and which apps/myk9show/src/features/_shared/
-- entryAccounting.ts mirrors for the client after MYK9-118:
--
--   expected = entry_status NOT IN ('scratched','withdrawn','cancelled')
--              AND check_in_status IS DISTINCT FROM 'pulled'
--
-- Writing a third variant of this predicate is how surfaces end up disagreeing
-- with each other and with the server, which is the failure mode behind both
-- MYK9-65 and MYK9-118. Change it in 20260712180000 and here together, or not at
-- all.
--
-- Comparisons are lower()ed because these columns are free text, not enums.

BEGIN;

CREATE OR REPLACE FUNCTION public.tv_class_entry_counts(p_show_id uuid)
RETURNS TABLE (class_id uuid, entry_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.class_id, count(*)::bigint
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

CREATE OR REPLACE FUNCTION public.tv_board_entries(
  p_show_id uuid,
  p_class_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  class_id uuid,
  armband text,
  handler text,
  run_order integer,
  is_in_ring boolean,
  is_scored boolean,
  dog_name text,
  dog_call_name text,
  dog_image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    e.id,
    e.class_id,
    e.armband,
    e.handler,
    e.run_order,
    COALESCE(e.is_in_ring, false),
    COALESCE(e.is_scored, false),
    d.name,
    d.call_name,
    d.image_url
  FROM public.entries AS e
  LEFT JOIN public.dogs AS d ON d.id = e.dog_id
  WHERE e.show_id = p_show_id
    AND e.class_id = ANY (p_class_ids)
    AND e.deleted_at IS NULL
    AND lower(coalesce(e.entry_status, '')) NOT IN ('scratched', 'withdrawn', 'cancelled')
    AND lower(coalesce(e.check_in_status, '')) IS DISTINCT FROM 'pulled'
    AND (e.is_scored IS DISTINCT FROM true OR e.is_in_ring IS true)
    AND EXISTS (
      SELECT 1
      FROM public.shows AS s
      WHERE s.id = p_show_id
        AND s.status IN ('published', 'upcoming', 'in_progress', 'completed')
        AND s.deleted_at IS NULL
    )
  ORDER BY e.run_order ASC NULLS LAST;
$$;

-- CREATE OR REPLACE preserves the existing ACL, but restate it so a rebuild from
-- migrations alone reaches the same grants as the live database. Both functions
-- are keep-listed for anon EXECUTE in migrationGrantDecisionContract.
REVOKE ALL ON FUNCTION public.tv_class_entry_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tv_board_entries(uuid, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.tv_class_entry_counts(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tv_board_entries(uuid, uuid[]) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
