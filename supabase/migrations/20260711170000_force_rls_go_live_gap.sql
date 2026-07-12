-- SA-021: restore the project's FORCE ROW LEVEL SECURITY invariant for the
-- four extant tables created after the earlier static sweeps.
--
-- The July 11 audit also named public.unified_ringside_overrides. Ordered
-- migration replay and a live pg_class query prove that table was dropped by
-- applied migration 20260623120000_remove_unified_ringside_flag.sql, so this
-- migration intentionally does not reference the nonexistent object.

ALTER TABLE public.secretary_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.club_premium_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.premium_generations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts FORCE ROW LEVEL SECURITY;

-- ROLLBACK (manual only; preserves RLS and existing policies/grants):
-- ALTER TABLE public.secretary_tasks NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.club_premium_templates NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.premium_generations NO FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.login_attempts NO FORCE ROW LEVEL SECURITY;
