-- MYK9-65: the public TV board must read the same numbers for every viewer.
--
-- The board at /tv/:showId is a wall display in a venue. Its reads currently run
-- under the VIEWER's session, and the two SELECT policies on public.entries have
-- deliberately different scopes:
--
--   entries_anon_select_for_tv  {anon}           every non-deleted entry of a
--                                                published/upcoming/in_progress/
--                                                completed, non-deleted show
--   entries_select              {authenticated}  manageable_show_ids() OR own
--                                                handler_id OR own dog
--
-- So an anonymous wall display counts a 66-entry class correctly, while a
-- signed-in exhibitor standing in front of the SAME screen counts only their own
-- dogs and reads "3 / 2". The running order has the identical defect: a signed-in
-- exhibitor sees only their own dogs in "up next" on a public board. That one is
-- pre-existing and older than the count bug.
--
-- A plausible wrong number is worse than a visibly broken one, which is why the
-- count fix was held back until this migration existed rather than shipping the
-- client change alone.
--
-- Both functions are SECURITY DEFINER so the board's contents depend on the SHOW,
-- never on who is looking. Each one re-derives the exact predicate of
-- entries_anon_select_for_tv (see 20260801190000) rather than trusting its
-- arguments: p_show_id must resolve to a live, publicly-visible show, and rows are
-- constrained to that show's own entries. Passing another show's class ids
-- therefore returns nothing instead of leaking across shows.
--
-- Exposing these to anon grants no information anon cannot already read row by row
-- under entries_anon_select_for_tv — it is the same rows, aggregated and ordered.
-- What changes is that AUTHENTICATED viewers now see the same board as everyone
-- else, which is the entire point of a public display.

BEGIN;

-- Per-class totals, counted from entry rows.
--
-- classes.total_entries_count is a denormalized snapshot with no maintaining
-- trigger — it is 0 for every class in the database — while scored_count IS
-- advanced by scoring. Mixing the two is what published "3 / 0" to a room of
-- exhibitors. Entry rows are the only truthful source for a total.
--
-- Classes with no entries are simply absent from the result; the caller supplies
-- 0 for its own known class ids. Returning one row per requested id would mean
-- trusting the caller's list, and the show scoping above is worth more than the
-- convenience.
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
    AND EXISTS (
      SELECT 1
      FROM public.shows AS s
      WHERE s.id = p_show_id
        AND s.status IN ('published', 'upcoming', 'in_progress', 'completed')
        AND s.deleted_at IS NULL
    )
  GROUP BY e.class_id;
$$;

-- The running order behind "up next".
--
-- Mirrors the client's previous PostgREST query exactly: non-deleted entries of
-- the given classes, unscored OR currently in the ring, ordered by run_order.
-- The dogs join moves in here too — an embedded relation is read under the
-- viewer's session as well, so leaving it outside would preserve half the bug.
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

-- Postgres grants EXECUTE to PUBLIC by default, which on a SECURITY DEFINER
-- function means every role including future ones. Revoke first, then grant the
-- two roles that actually drive a board.
REVOKE ALL ON FUNCTION public.tv_class_entry_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tv_board_entries(uuid, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.tv_class_entry_counts(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tv_board_entries(uuid, uuid[]) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
