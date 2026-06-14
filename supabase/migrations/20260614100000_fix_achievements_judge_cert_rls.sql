-- Correct two RLS policies from migration 20260614090000 per PR #727 review.
--
-- 1. achievements — 20260614090000 wrongly treated this as admin-managed
--    reference data and locked writes to site admins.  In fact achievements is
--    dog-owned user data (achievements.dog_id REFERENCES dogs ON DELETE
--    CASCADE), written by the premium dog-detail UI via useCreateAchievement /
--    useUpdateAchievement / useDeleteAchievement.  Site-admin-only would remove
--    "Add External Achievement" for every normal owner.  The original migration
--    006 policy (FOR ALL USING (true)) was also wrong the other way — it let any
--    authenticated user mutate ANY dog's achievements.  Correct scope is the
--    dog owner / co-owner (mirroring dog_registrations, migration 016), plus
--    site admins.
--
-- 2. judge_certifications — 20260614090000 allowed any club admin (is_club_admin()
--    with no club argument) to insert/update/delete ANY global certification row.
--    Since the threat model is fabricated judge credentials, that left the same
--    high-impact mutation open to every club admin, with no show/club-scoped
--    relationship tying a club admin to a given judge.  No app code writes this
--    table today, so restricting to site admins breaks nothing and closes the
--    vector.  Re-introduce scoped club-admin writes later only with a real
--    club↔judge relationship to check against.

BEGIN;

-- ─── achievements → dog-owner scoped ─────────────────────────────────────────
DROP POLICY IF EXISTS "achievements_insert" ON public.achievements;
DROP POLICY IF EXISTS "achievements_update" ON public.achievements;
DROP POLICY IF EXISTS "achievements_delete" ON public.achievements;

CREATE POLICY "achievements_insert" ON public.achievements
  FOR INSERT TO authenticated
  WITH CHECK (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_site_admin())
  );

CREATE POLICY "achievements_update" ON public.achievements
  FOR UPDATE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_site_admin())
  );

CREATE POLICY "achievements_delete" ON public.achievements
  FOR DELETE TO authenticated
  USING (
    dog_id IN (
      SELECT id FROM public.dogs
      WHERE owner_id = (SELECT get_my_person_id())
         OR co_owner_id = (SELECT get_my_person_id())
    )
    OR (SELECT is_site_admin())
  );

-- ─── judge_certifications → site-admin only ──────────────────────────────────
DROP POLICY IF EXISTS "judge_certifications_insert" ON public.judge_certifications;
DROP POLICY IF EXISTS "judge_certifications_update" ON public.judge_certifications;
DROP POLICY IF EXISTS "judge_certifications_delete" ON public.judge_certifications;

CREATE POLICY "judge_certifications_insert" ON public.judge_certifications
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_site_admin()));

CREATE POLICY "judge_certifications_update" ON public.judge_certifications
  FOR UPDATE TO authenticated
  USING ((SELECT is_site_admin()));

CREATE POLICY "judge_certifications_delete" ON public.judge_certifications
  FOR DELETE TO authenticated
  USING ((SELECT is_site_admin()));

NOTIFY pgrst, 'reload schema';

COMMIT;
