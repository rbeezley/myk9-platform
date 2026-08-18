-- MYK9-65 follow-up 3: two boundaries a SECURITY DEFINER function has to
-- re-enforce by hand, because it no longer gets them from RLS.
--
-- 1. DOG SOFT-DELETES. `public.dogs` has exactly one SELECT policy — `dogs_select`,
--    TO authenticated — and it excludes `deleted_at IS NOT NULL`. Reading the dog
--    through a definer join skips that, so an active entry still pointing at a
--    soft-deleted dog would put its name, call name and image on a public venue
--    screen. No such row exists today (verified: 0 live entries reference a
--    soft-deleted dog), which is exactly why it must be closed now rather than
--    after the first one appears.
--
--    The filter goes in the JOIN, not the WHERE: the entry keeps its place in the
--    running order with a null dog, rather than vanishing from the board and
--    making the list disagree with the total beside it — the failure this whole
--    issue is about.
--
--    Worth recording: since `dogs_select` is TO authenticated only, the previous
--    PostgREST embed `dogs(name, call_name, image_url)` returned nothing for anon,
--    so an unauthenticated wall display — the board's PRIMARY audience — was
--    already showing entries without dog names. Moving the join server-side fixes
--    that as a side effect.
--
-- 2. NON-PUBLIC SHOWS vs GENUINELY EMPTY CLASSES. tv_class_entry_counts returned
--    grouped rows, so a draft show (deliberately no rows) was indistinguishable
--    from a show whose classes are all empty. The client filled the gap with 0 and
--    a secretary previewing an unpublished show saw a confident "0 / 0" — the
--    precise failure mode MYK9-65's acceptance criteria rule out: cold/partial
--    states must render unavailable, never a confident zero.
--
--    So the function now takes the caller's class ids and returns ONE ROW PER
--    REQUESTED CLASS whenever the show is publicly visible, including zeros. No
--    rows now means exactly one thing: this show is not public. The client turns
--    that into "unavailable" instead of zeros. Note this makes the empty result
--    unambiguous WITHOUT widening what the function exposes — a non-public show
--    still yields nothing.

BEGIN;

DROP FUNCTION IF EXISTS public.tv_class_entry_counts(uuid);

CREATE FUNCTION public.tv_class_entry_counts(
  p_show_id uuid,
  p_class_ids uuid[]
)
RETURNS TABLE (class_id uuid, entry_count bigint, scored_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    requested.class_id,
    count(e.id)::bigint,
    count(e.id) FILTER (WHERE e.is_scored IS true)::bigint
  FROM unnest(p_class_ids) AS requested(class_id)
  LEFT JOIN public.entries AS e
    ON e.class_id = requested.class_id
   AND e.show_id = p_show_id
   AND e.deleted_at IS NULL
   AND lower(coalesce(e.entry_status, '')) NOT IN ('scratched', 'withdrawn', 'cancelled')
   AND lower(coalesce(e.check_in_status, '')) IS DISTINCT FROM 'pulled'
  WHERE EXISTS (
    SELECT 1
    FROM public.shows AS s
    WHERE s.id = p_show_id
      AND s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      AND s.deleted_at IS NULL
  )
  GROUP BY requested.class_id;
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
  LEFT JOIN public.dogs AS d
    ON d.id = e.dog_id
   AND d.deleted_at IS NULL
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

-- The counts function changed signature, so the old ACL went with the DROP.
REVOKE ALL ON FUNCTION public.tv_class_entry_counts(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tv_board_entries(uuid, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.tv_class_entry_counts(uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tv_board_entries(uuid, uuid[]) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
