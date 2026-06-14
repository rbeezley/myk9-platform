-- Tighten write RLS on reference/lookup tables left open since migration 006
--
-- Migration 006 created "FOR ALL TO authenticated USING (true)" policies on
-- reference tables.  class_templates was later dropped (migration 032).
-- The remaining four were never superseded: achievements, show_templates,
-- template_fields, judge_certifications.  They allow any authenticated user to INSERT/UPDATE/DELETE
-- reference data — the highest-risk case being judge_certifications, where a
-- rogue user could fabricate judge credentials.
--
-- Fix: drop the blanket _all policies; the existing _select policies stay in
-- place so all authenticated users can still read template/lookup data.
-- Writes are restricted to platform admins.

BEGIN;

-- ─── achievements ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "achievements_all" ON public.achievements;

CREATE POLICY "achievements_insert" ON public.achievements
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_site_admin()));

CREATE POLICY "achievements_update" ON public.achievements
  FOR UPDATE TO authenticated
  USING ((SELECT is_site_admin()));

CREATE POLICY "achievements_delete" ON public.achievements
  FOR DELETE TO authenticated
  USING ((SELECT is_site_admin()));

-- ─── show_templates ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "show_templates_all" ON public.show_templates;

CREATE POLICY "show_templates_insert" ON public.show_templates
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_site_admin()));

CREATE POLICY "show_templates_update" ON public.show_templates
  FOR UPDATE TO authenticated
  USING ((SELECT is_site_admin()));

CREATE POLICY "show_templates_delete" ON public.show_templates
  FOR DELETE TO authenticated
  USING ((SELECT is_site_admin()));

-- ─── template_fields ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "template_fields_all" ON public.template_fields;

CREATE POLICY "template_fields_insert" ON public.template_fields
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_site_admin()));

CREATE POLICY "template_fields_update" ON public.template_fields
  FOR UPDATE TO authenticated
  USING ((SELECT is_site_admin()));

CREATE POLICY "template_fields_delete" ON public.template_fields
  FOR DELETE TO authenticated
  USING ((SELECT is_site_admin()));

-- ─── judge_certifications ────────────────────────────────────────────────────
-- Highest-risk: any user could add fake certifications for any judge.
-- Club admins (any club) manage certifications for judges in their roster;
-- judge_certifications is global lookup data, not scoped to a specific club.
DROP POLICY IF EXISTS "judge_certifications_all" ON public.judge_certifications;

CREATE POLICY "judge_certifications_insert" ON public.judge_certifications
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_club_admin())
    OR (SELECT is_site_admin())
  );

CREATE POLICY "judge_certifications_update" ON public.judge_certifications
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_site_admin())
  );

CREATE POLICY "judge_certifications_delete" ON public.judge_certifications
  FOR DELETE TO authenticated
  USING (
    (SELECT is_club_admin())
    OR (SELECT is_site_admin())
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
