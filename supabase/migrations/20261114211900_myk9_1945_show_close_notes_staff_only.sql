-- =============================================================================
-- Show close notes move to a staff-only table (MYK9-1945, migration only)
-- =============================================================================
-- Owner decision (2026-11-14): shows.closed_open_lines and shows.reopen_reason
-- (added by 20261114194300) leave `shows` and live in a table only the show's staff can
-- read or write. anon can read every column on `shows`, and reopen_reason is free text
-- a secretary types. shows.closed_at / shows.reopened_at are not free text and stay.
-- trials.status_before_close and classes.status_before_close stay where they are.
--
-- No live show has written to the dropped columns, so nothing is copied.
--
-- One row per show. No `version` / `created_at`: the table is online-only staff data and
-- is not registered for replication; the close/reopen UI phase decides that.
--
-- ACCESS: select / insert / update for the show's staff, using the same predicate as the
-- shows_update policy (club admin, trial secretary of the show's club, site admin,
-- platform admin; a club-less show reaches only the two admins). No delete policy and no
-- DELETE grant: the row goes only through the shows(id) ON DELETE CASCADE.
--
-- GRANTS: default privileges here give anon full CRUD on every new table, so anon (and
-- PUBLIC) are revoked explicitly. Verify against pg_class.relacl after the push.
-- =============================================================================

BEGIN;

CREATE TABLE public.show_close_notes (
  show_id uuid PRIMARY KEY REFERENCES public.shows(id) ON DELETE CASCADE,
  closed_open_lines jsonb,
  reopen_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT show_close_notes_closed_open_lines_array_check
    CHECK (closed_open_lines IS NULL OR jsonb_typeof(closed_open_lines) = 'array')
);

COMMENT ON TABLE public.show_close_notes IS
  'MYK9-1945: staff-only close/reopen notes, one row per show. Online-only (not replicated). Readable and writable only by the show''s staff; anon has no access.';
COMMENT ON COLUMN public.show_close_notes.closed_open_lines IS
  'MYK9-1945: the unticked "Finish the show" lines at close, a jsonb array of {key, count}. NULL when the show was never closed with a record.';
COMMENT ON COLUMN public.show_close_notes.reopen_reason IS
  'MYK9-1945: the free-text reason given when the show was reopened.';

REVOKE ALL ON public.show_close_notes FROM PUBLIC;
REVOKE ALL ON public.show_close_notes FROM anon;
REVOKE ALL ON public.show_close_notes FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.show_close_notes TO authenticated;
GRANT ALL ON public.show_close_notes TO service_role;

ALTER TABLE public.show_close_notes ENABLE ROW LEVEL SECURITY;

-- Staff predicate = shows_update (20260916015300), evaluated against the note's show.
CREATE POLICY show_close_notes_select ON public.show_close_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shows s
      WHERE s.id = show_close_notes.show_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (SELECT public.is_site_admin())
          OR (SELECT public.is_platform_admin())
        )
    )
  );

CREATE POLICY show_close_notes_insert ON public.show_close_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shows s
      WHERE s.id = show_close_notes.show_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (SELECT public.is_site_admin())
          OR (SELECT public.is_platform_admin())
        )
    )
  );

CREATE POLICY show_close_notes_update ON public.show_close_notes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shows s
      WHERE s.id = show_close_notes.show_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (SELECT public.is_site_admin())
          OR (SELECT public.is_platform_admin())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shows s
      WHERE s.id = show_close_notes.show_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (SELECT public.is_site_admin())
          OR (SELECT public.is_platform_admin())
        )
    )
  );

ALTER TABLE public.shows DROP CONSTRAINT IF EXISTS shows_closed_open_lines_array_check;
ALTER TABLE public.shows
  DROP COLUMN IF EXISTS closed_open_lines,
  DROP COLUMN IF EXISTS reopen_reason;

COMMIT;
