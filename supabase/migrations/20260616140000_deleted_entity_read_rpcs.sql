-- Admin read access to soft-deleted dogs / shows / classes / people for the
-- Deleted Entities restore UI (/admin/data-lifecycle).
--
-- These four tables' `*_select` RLS policies hard-code `deleted_at IS NULL` for
-- every role, so not even a site_admin can SELECT a tombstoned row — the restore
-- UI's count and list both come back empty and the sections never render
-- (verified 2026-06-16: deleting Dog 1 left it unrestorable via the UI).
--
-- We deliberately do NOT loosen those select policies: those tables hide deleted
-- rows via RLS *by design* (normal lists rely on it; e.g. dog replication polling
-- depends on deleted dogs dropping out of RLS visibility). Loosening RLS would
-- leak tombstones into normal admin views. Instead, expose admin-only
-- SECURITY DEFINER read functions that bypass RLS and are gated to
-- is_platform_admin(). A non-admin caller simply gets zero rows (no error).
--
-- Restore (the UPDATE) already works for admins — dogs/shows/classes_update carry
-- no deleted_at block — so only the listing read needed fixing.

CREATE OR REPLACE FUNCTION public.get_deleted_dogs()
  RETURNS SETOF public.dogs
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT * FROM public.dogs
  WHERE deleted_at IS NOT NULL
    AND (SELECT public.is_platform_admin())
  ORDER BY deleted_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_deleted_shows()
  RETURNS SETOF public.shows
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT * FROM public.shows
  WHERE deleted_at IS NOT NULL
    AND (SELECT public.is_platform_admin())
  ORDER BY deleted_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_deleted_classes()
  RETURNS SETOF public.classes
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT * FROM public.classes
  WHERE deleted_at IS NOT NULL
    AND (SELECT public.is_platform_admin())
  ORDER BY deleted_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_deleted_people()
  RETURNS SETOF public.people
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT * FROM public.people
  WHERE deleted_at IS NOT NULL
    AND (SELECT public.is_platform_admin())
  ORDER BY deleted_at DESC;
$$;

-- Default PUBLIC EXECUTE (which anon inherits) is revoked first; only
-- authenticated callers reach the body, and the is_platform_admin() gate inside
-- still does the real authorization. Matches the repo's anon-grant hardening.
REVOKE ALL ON FUNCTION public.get_deleted_dogs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_deleted_shows() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_deleted_classes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_deleted_people() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_deleted_dogs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deleted_shows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deleted_classes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deleted_people() TO authenticated;
