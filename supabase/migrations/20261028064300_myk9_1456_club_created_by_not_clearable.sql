-- MYK9-1456: an API session may no longer clear clubs.created_by.
--
-- guard_club_created_by_write (20261001174300, MYK9-909) made created_by
-- server-assigned and immutable, but let an UPDATE set it to NULL ("only
-- reduces visibility"). Since MYK9-1395 (20261027235700) the folded
-- club-awaiting-authorization notice links site admins to
-- /admin/onboarding?creator=<uid>, which lists that creator's pending clubs by
-- created_by. A creator who clears created_by drops their club out of the view
-- the notice points at. The owner chose to close that by making the column
-- non-clearable by the caller, rather than recording notified club ids.
--
-- Change: for API sessions (an auth.uid(), or role authenticated/anon) UPDATE
-- always restores OLD.created_by. Other sessions (service_role, direct
-- postgres: account cleanup, seeds) may still set or clear it, as INSERT
-- already distinguishes. INSERT is unchanged. Copied from the latest
-- definition (20261001174300; matches pg_get_functiondef on the live DB,
-- 2026-10-28). The trigger and grants are unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_club_created_by_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL
       OR coalesce(current_setting('role', true), 'none') IN ('authenticated', 'anon') THEN
      NEW.created_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: immutable for API sessions, including clearing it (MYK9-1456).
  -- Other sessions keep what they supply.
  IF auth.uid() IS NOT NULL
     OR coalesce(current_setting('role', true), 'none') IN ('authenticated', 'anon') THEN
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_club_created_by_write() IS
  'MYK9-909, MYK9-1456: clubs.created_by is server-assigned. INSERT by an API role (or any session with an auth.uid()) forces created_by := auth.uid(); UPDATE by such a session always restores OLD.created_by (it can neither change nor clear it). Other sessions (service_role, direct postgres) keep the supplied value on INSERT and UPDATE. SECURITY INVOKER: auth.uid() only reads request.jwt.claims.';

REVOKE ALL ON FUNCTION public.guard_club_created_by_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_club_created_by_write() FROM anon;
REVOKE ALL ON FUNCTION public.guard_club_created_by_write() FROM authenticated;

COMMIT;
