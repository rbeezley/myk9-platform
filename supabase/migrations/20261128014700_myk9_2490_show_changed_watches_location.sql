-- =============================================================================
-- MYK9-2490: correcting a show's street address emails exhibitors.
--
-- The show wizard saves the address in shows.location and fills none of venue_name,
-- address, zip_code, so the trigger from 20261117094700 (MYK9-2124), which watched only
-- the separate columns, never fired for a corrected address. location joins both the
-- UPDATE OF column list and the WHEN clause. The trigger function is unchanged: it
-- queues by show id and does not compare columns. The email is rendered at send time.
--
-- Rollback: recreate the trigger with the five-column list and WHEN from 20261117094700.
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_queue_show_changed_email_show ON public.shows;
CREATE TRIGGER trg_queue_show_changed_email_show
  AFTER UPDATE OF venue_name, address, city, state, zip_code, location ON public.shows
  FOR EACH ROW
  WHEN (
    old.venue_name IS DISTINCT FROM new.venue_name
    OR old.address IS DISTINCT FROM new.address
    OR old.city IS DISTINCT FROM new.city
    OR old.state IS DISTINCT FROM new.state
    OR old.zip_code IS DISTINCT FROM new.zip_code
    OR old.location IS DISTINCT FROM new.location
  )
  EXECUTE FUNCTION public.queue_show_changed_email_from_show();

COMMIT;
