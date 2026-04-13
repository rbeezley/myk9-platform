-- Migration 130: Rename registrations → enrollments
--
-- "Registration" in the dog sport world means a dog's AKC/UKC registration
-- number. Using the same word for show enrollment causes confusion in the UI
-- and in support conversations. Renaming the table to "enrollments" clarifies
-- that these rows represent a handler's enrollment in a show, not a dog's
-- breed-organization registration.
--
-- PostgreSQL automatically re-associates all of the following with the new
-- table name on ALTER TABLE ... RENAME TO:
--   • primary key, unique, and check constraints
--   • foreign key references from other tables (e.g. entries.registration_id)
--   • row-level security policies defined on the table
--   • triggers attached to the table
--
-- What we must handle explicitly:
--   1. Index rename (names are not changed by ALTER TABLE RENAME TO)
--   2. The email_log_select RLS policy on the email_log table, whose body
--      contains a hard-coded FROM public.registrations reference

-- ==========================================================================
-- 1. Rename the table
-- ==========================================================================

ALTER TABLE public.registrations RENAME TO enrollments;

-- ==========================================================================
-- 2. Rename index (cosmetic, keeps naming consistent)
-- ==========================================================================

ALTER INDEX IF EXISTS idx_registrations_show_handler
  RENAME TO idx_enrollments_show_handler;

-- ==========================================================================
-- 3. Fix the email_log_select RLS policy
--    (its body references public.registrations by name)
-- ==========================================================================

DROP POLICY IF EXISTS email_log_select ON email_log;

CREATE POLICY email_log_select ON email_log
  FOR SELECT USING (
    (SELECT public.is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.shows s ON s.id = e.show_id
      WHERE e.id = email_log.related_id
      AND (SELECT public.is_show_official(s.id))
    )
  );
