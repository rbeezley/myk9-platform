-- F30: a club is the tenant root for its shows. Do not orphan shows when the
-- club is deleted; the stronger shows.club_id NOT NULL guard is deferred until
-- the existing audit orphan rows are cleaned up.

BEGIN;

ALTER TABLE public.shows
  DROP CONSTRAINT IF EXISTS shows_club_id_fkey;

ALTER TABLE public.shows
  ADD CONSTRAINT shows_club_id_fkey
  FOREIGN KEY (club_id)
  REFERENCES public.clubs(id)
  ON DELETE RESTRICT;

COMMIT;
