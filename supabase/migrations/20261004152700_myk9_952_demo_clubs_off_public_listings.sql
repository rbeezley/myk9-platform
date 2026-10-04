-- =============================================================================
-- MYK9-952: demo fixture clubs stay off the public listings
-- =============================================================================
--
-- Problem. supabase/seed-demo.sql publishes the Heartland Scent Work Club
-- (dededede-…-001) and Prairie Trail Dog Sports Club (dededede-…-002) shows on
-- purpose: ~13 E2E specs that run against this one project need them public.
-- Signed out, myk9show.com/shows therefore listed "Heartland Scent Work
-- Classic" and "Heartland UKC Nosework Trial" beside real club shows, and the
-- guest club directory listed both demo clubs.
--
-- Fix (owner-approved Option 1, a demo flag):
--
-- 1. clubs.is_demo boolean NOT NULL DEFAULT false. Club-level, not show-level:
--    every show a demo club hosts is a fixture, including shows a test creates
--    under it at run time, so one flag on the parent covers all of them.
--
-- 2. Backfill: the two seed-demo clubs, verified on live by id 2026-10-04
--    (`select id, name from clubs`: Heartland …001 hosts 6 shows, 2 published;
--    Prairie Trail …002 hosts 1, published). The load-fixture clubs
--    (a1090000-0000-0000-0013-…) are absent from live; seed-load-fixture.sql
--    sets the flag itself when it runs. The seed sets is_demo on every run
--    (INSERT and ON CONFLICT DO UPDATE), so a reseed cannot clear it.
--
-- 3. Write guard (guard_club_is_demo_write): only a non-API session (the seed's
--    direct postgres connection, service_role) sets or changes the flag. From
--    `authenticated`/`anon`, an INSERT silently gets false and an UPDATE that
--    changes it raises 42501. clubs_update lets a club admin PATCH their own
--    club row, so without this a demo club admin could publish the fixtures
--    back into Find Shows, or a real club could hide itself from the directory.
--    Same API-roles-only carve-out as guard_club_authorization_write
--    (latest definition: 20260925072300).
--
-- WHAT IS NOT CHANGED, ON PURPOSE. No SELECT policy changes. The issue's
-- acceptance keeps direct links working for everyone ("Direct links and
-- signed-in test accounts still reach them"), and banner-sticky-cta.spec.ts
-- reads a published show with classes AS ANON straight from PostgREST. A
-- shows_anon_select / clubs_select filter cannot tell a listing from a
-- by-id read, so hiding demo rows from anon in RLS would break both. is_demo
-- is a LISTING property, not an access-control one: demo shows are not
-- secret. The two signed-out listing reads apply it:
--   * postgrestGetPublicShows (Find Shows: list, calendar, map, month strip
--     counts all derive from that one guest query) via its LEFT club embed
--     filtered on club.is_demo = false plus or=(club_id.is.null,
--     club.not.is.null), so clubless public shows (club_id is still
--     nullable) keep listing;
--   * getPublicDirectoryClubs (guest club directory) via is_demo = false.
-- Signed-in sessions read the replica (shows_select / clubs_select as today)
-- and keep seeing the demo shows, so every signed-in E2E flow is unchanged.
--
-- Grants. anon holds table-level SELECT on clubs and authenticated table-level
-- arwd (live pg_class.relacl, 2026-10-04), with no column-level ACLs on clubs
-- (pg_attribute.attacl empty), so the new column is readable by both with no
-- GRANT: the embed filter `club.is_demo` needs anon to read it. Writes
-- are fenced by the guard trigger, not by a column REVOKE (a column REVOKE
-- cannot narrow a table-level UPDATE grant).
--
-- Behavioral coverage (CI-only): supabase/tests/myk9_952_demo_clubs_listing_test.sql.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clubs.is_demo IS
  'MYK9-952: true for seed/E2E fixture clubs (seed-demo.sql, seed-load-fixture.sql). Their shows stay off the signed-out public listings (Find Shows, guest club directory); direct links and signed-in sessions still reach them. Set only by a non-API session (guard_club_is_demo_write).';

-- ---------------------------------------------------------------------------
-- 2. Write guard (before the backfill, so the backfill runs under it: this
--    migration's session is not an API role, which is the carve-out)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_club_is_demo_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_demo := false;
    RETURN NEW;
  END IF;

  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'A club''s demo flag is set only by the seed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_club_is_demo_write() IS
  'MYK9-952: clubs.is_demo is writable only from a non-API session (seed, service_role). From authenticated/anon an INSERT is forced to false and an UPDATE changing it raises 42501. API-roles-only carve-out as in guard_club_authorization_write.';

REVOKE ALL ON FUNCTION public.guard_club_is_demo_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_club_is_demo_write() FROM anon;
REVOKE ALL ON FUNCTION public.guard_club_is_demo_write() FROM authenticated;

DROP TRIGGER IF EXISTS trg_guard_club_is_demo_write ON public.clubs;
CREATE TRIGGER trg_guard_club_is_demo_write
  BEFORE INSERT OR UPDATE ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.guard_club_is_demo_write();

-- ---------------------------------------------------------------------------
-- 3. Backfill the two seed-demo clubs
-- ---------------------------------------------------------------------------
UPDATE public.clubs
   SET is_demo = true
 WHERE id IN (
   'dededede-0000-0000-0000-000000000001',
   'dededede-0000-0000-0000-000000000002'
 )
   AND is_demo IS DISTINCT FROM true;

COMMIT;
