BEGIN;

-- MYK9-2341: server-only columns get the same write guard as confirmation_claimed_until
-- (MYK9-2088), and request_new_club gets a pinned pg_temp.
--
-- authenticated holds TABLE-level INSERT/UPDATE on public.entries and public.clubs, and a
-- column REVOKE cannot narrow a table grant, so these columns were client-writable:
--   * entries.reminder_email_sent_at / reminder_email_status (MYK9-2113): an exhibitor passing
--     entries UPDATE RLS could set status 'sent' to suppress the reminder, or reset them to
--     NULL / 'pending' to re-trigger the email every ten minutes across the morning window.
--   * clubs.first_show_published_at (MYK9-2199): "never cleared", yet a club admin could PATCH it.
-- A BEFORE INSERT OR UPDATE trigger restores OLD (INSERT: the column default) when current_user
-- is anon or authenticated. service_role and owner-run code, including the SECURITY DEFINER
-- stamp trigger trg_shows_stamp_club_first_published, pass untouched.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION private.entries_reminder_email_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.reminder_email_sent_at := NULL;
      NEW.reminder_email_status := 'pending';
    ELSE
      NEW.reminder_email_sent_at := OLD.reminder_email_sent_at;
      NEW.reminder_email_status := OLD.reminder_email_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_reminder_email_guard() IS
  'MYK9-2341: a client (anon/authenticated) cannot write entries.reminder_email_sent_at or reminder_email_status; INSERT gets the defaults, UPDATE keeps OLD. service_role and owner-run code may write them.';

REVOKE ALL ON FUNCTION private.entries_reminder_email_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_entries_reminder_email_guard ON public.entries;
CREATE TRIGGER trg_entries_reminder_email_guard
  BEFORE INSERT OR UPDATE ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_reminder_email_guard();

CREATE OR REPLACE FUNCTION private.clubs_first_show_published_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.first_show_published_at := NULL;
    ELSE
      NEW.first_show_published_at := OLD.first_show_published_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.clubs_first_show_published_guard() IS
  'MYK9-2341: a client (anon/authenticated) cannot write clubs.first_show_published_at; only trg_shows_stamp_club_first_published (SECURITY DEFINER), service_role and owner-run code may.';

REVOKE ALL ON FUNCTION private.clubs_first_show_published_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_clubs_first_show_published_guard ON public.clubs;
CREATE TRIGGER trg_clubs_first_show_published_guard
  BEFORE INSERT OR UPDATE ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION private.clubs_first_show_published_guard();

-- request_new_club is SECURITY DEFINER with search_path = public; pin pg_temp last so a
-- caller's temp objects can never shadow public ones. Body unchanged.
ALTER FUNCTION public.request_new_club(text, jsonb, text, text)
  SET search_path = public, pg_temp;

-- Align review_club_access_request with request_new_club: PUBLIC and anon closed, signed-in only.
REVOKE EXECUTE ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_club_access_request(uuid, text, uuid, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
