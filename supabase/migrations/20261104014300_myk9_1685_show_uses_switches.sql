-- =============================================================================
-- MYK9-1685 (MYK9-1622 part A) — per-show "This show uses…" switches.
--
-- Owner rule (2026-10-31): a secretary who never opens a setting gets the
-- bare-minimum app. Six switches live in Edit show > Venue & policies:
--   1. Exhibitor self check-in  -> existing show_visibility_settings.self_checkin_enabled
--                                   (not touched here; default stays ON).
--   2. Judges score on devices  -> shows.uses_device_scoring   (default true)
--   3. Paper fallback packet    -> shows.uses_paper_packet     (default false)
--   4. Volunteer tracking       -> shows.uses_volunteers       (default false)
--   5. Public landing page      -> shows.uses_landing_page     (default false)
--   6. Publish own premium list -> shows.publishes_own_premium (default false)
--
-- GRANTS: public.shows carries table-level grants only (authenticated=arw,
-- anon=r, service_role=all; no column ACLs). New columns inherit them, which
-- is what these need: managers write through shows_update RLS, anon read is
-- harmless. No GRANT/REVOKE is therefore added. No view selects shows.*.
--
-- BACKFILL, so nothing that exists today disappears. Only rows that need a
-- change get a value; a final UPDATE touches every show so replicas re-pull. update_shows_updated_at (BEFORE UPDATE) bumps
-- updated_at on the rows it changes, which is wanted: replicas pull on updated_at, so
-- they pick the new columns up. The UPDATEs run as the migration role, which
-- the publish/club gates carve out (they gate authenticated/anon only).
-- =============================================================================

BEGIN;

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS uses_device_scoring boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS uses_paper_packet boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uses_volunteers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uses_landing_page boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publishes_own_premium boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shows.uses_device_scoring IS
  'MYK9-1685: judges score on devices (Access codes row on Show Desk Actions). Default true for every show.';
COMMENT ON COLUMN public.shows.uses_paper_packet IS
  'MYK9-1685: the show keeps a paper fallback packet (Emergency trial packet row). Backfilled true where trial_packet_snapshots has a row.';
COMMENT ON COLUMN public.shows.uses_volunteers IS
  'MYK9-1685: the show tracks volunteers (Volunteers row). Backfilled true where volunteers has a row for the show.';
COMMENT ON COLUMN public.shows.uses_landing_page IS
  'MYK9-1685: the show uses a public landing page. Backfilled true where an experience was ever published. Effect lands in MYK9-1686.';
COMMENT ON COLUMN public.shows.publishes_own_premium IS
  'MYK9-1685: the club publishes its own premium list. Stored only; effect lands in MYK9-1686.';

UPDATE public.shows s
   SET uses_paper_packet = true
 WHERE s.uses_paper_packet = false
   AND EXISTS (SELECT 1 FROM public.trial_packet_snapshots t WHERE t.show_id = s.id);

UPDATE public.shows s
   SET uses_volunteers = true
 WHERE s.uses_volunteers = false
   AND EXISTS (SELECT 1 FROM public.volunteers v WHERE v.show_id = s.id);

UPDATE public.shows s
   SET uses_landing_page = true
 WHERE s.uses_landing_page = false
   AND (s.experience_is_published OR s.experience_published_at IS NOT NULL);

-- Replicas pull on updated_at: touch every show so cached copies re-pull and carry the new
-- columns (the defaults on rows no backfill above changed would otherwise never reach them).
UPDATE public.shows SET updated_at = now();

COMMIT;
