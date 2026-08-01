-- MYK9-149 / SA-2026-07-29-08: soft-deleted entries must not remain on the
-- anonymous TV/running-order surface after an entry is withdrawn or removed.
-- The existing show predicate hides deleted shows, but it did not apply the
-- entries row's own soft-delete marker.

ALTER POLICY "entries_anon_select_for_tv" ON public.entries
  USING (
    entries.deleted_at IS NULL
    AND entries.show_id IN (
      SELECT s.id
      FROM public.shows AS s
      WHERE s.status IN ('published', 'upcoming', 'in_progress', 'completed')
        AND s.deleted_at IS NULL
    )
  );

NOTIFY pgrst, 'reload schema';
