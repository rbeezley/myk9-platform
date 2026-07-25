-- MYK9-93 Phase 1 — tighten the three permissive SELECT policies that expose
-- non-public data to anon, and document the ones that are deliberately public.
--
-- Context: ALTER DEFAULT PRIVILEGES in schema public grants anon full CRUD on every
-- new table, so RLS is the only layer that protects data. A `USING (true)` policy with
-- no TO clause is therefore world-readable. Phase 2 (next migration) fixes the grant
-- layer; this migration fixes the policies.

-- ---------------------------------------------------------------------------
-- 1. dog_registrations — registration_number / certificate must not be public.
-- ---------------------------------------------------------------------------
-- Visibility delegates to dogs_select: you can read a dog's registrations exactly
-- when you can read the dog (owner, co-owner, show manager, or handler of record).
-- Not recursive — dogs_select does not reference dog_registrations.

DROP POLICY IF EXISTS dog_registrations_select ON public.dog_registrations;

CREATE POLICY dog_registrations_select ON public.dog_registrations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.dogs d WHERE d.id = dog_registrations.dog_id)
  );

COMMENT ON POLICY dog_registrations_select ON public.dog_registrations IS
  'MYK9-93: registration numbers are not public. Delegates to dogs_select — a registration '
  'is readable exactly when its dog is.';

-- ---------------------------------------------------------------------------
-- 2. judge_certifications — certification numbers must not be public.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS judge_certifications_select ON public.judge_certifications;

CREATE POLICY judge_certifications_select ON public.judge_certifications
  FOR SELECT TO authenticated
  USING (
    (SELECT is_show_manager())
    OR (SELECT is_site_admin())
    OR person_id = (SELECT get_my_person_id())
  );

COMMENT ON POLICY judge_certifications_select ON public.judge_certifications IS
  'MYK9-93: certification numbers are not public. Show managers, site admins, and the '
  'judge themselves.';

-- ---------------------------------------------------------------------------
-- 3. nationals_* — no anon (or authenticated-at-large) read at all.
-- ---------------------------------------------------------------------------
-- These tables have zero application callers; they appear only in generated types.
-- A base-table `USING (true)` also routes around the public results release gate,
-- which nulls unreleased results for anon via view_public_entry_results. The existing
-- *_manage ALL policies already cover club admin / trial secretary / platform admin.

DROP POLICY IF EXISTS nationals_scores_select ON public.nationals_scores;
DROP POLICY IF EXISTS nationals_rankings_select ON public.nationals_rankings;
DROP POLICY IF EXISTS nationals_advancement_select ON public.nationals_advancement;

COMMENT ON TABLE public.nationals_scores IS
  'MYK9-93: no standalone SELECT policy by design — reads go through nationals_scores_manage '
  '(club admin / trial secretary / platform admin). Public results must go through '
  'view_public_entry_results so the release gate applies.';
COMMENT ON TABLE public.nationals_rankings IS
  'MYK9-93: no standalone SELECT policy by design — see nationals_scores.';
COMMENT ON TABLE public.nationals_advancement IS
  'MYK9-93: no standalone SELECT policy by design — see nationals_scores.';

-- ---------------------------------------------------------------------------
-- 4. Document the remaining USING (true) SELECT policies as deliberately public,
--    so the next audit does not re-litigate them.
-- ---------------------------------------------------------------------------

COMMENT ON POLICY achievements_select ON public.achievements IS
  'MYK9-93 reviewed: deliberately public — titles and achievements are published results.';
COMMENT ON POLICY armbands_select ON public.armbands IS
  'MYK9-93 reviewed: deliberately public — armband numbers back the anon TV / at-show boards.';
COMMENT ON POLICY class_visibility_select ON public.class_visibility_overrides IS
  'MYK9-93 reviewed: deliberately public — visibility flags are read by anon to decide what to show.';
COMMENT ON POLICY clubs_select ON public.clubs IS
  'MYK9-93 reviewed: deliberately public — club directory.';
COMMENT ON POLICY judge_assignments_select ON public.judge_assignments IS
  'MYK9-93 reviewed: deliberately public — who judges which ring is published show information.';
COMMENT ON POLICY rule_organizations_select ON public.rule_organizations IS
  'MYK9-93 reviewed: deliberately public — sanctioning-body reference data.';
COMMENT ON POLICY rule_sports_select ON public.rule_sports IS
  'MYK9-93 reviewed: deliberately public — sport reference data.';
COMMENT ON POLICY rulebooks_select ON public.rulebooks IS
  'MYK9-93 reviewed: deliberately public — published rulebooks.';
COMMENT ON POLICY rules_select ON public.rules IS
  'MYK9-93 reviewed: deliberately public — published rules.';
COMMENT ON POLICY show_templates_select ON public.show_templates IS
  'MYK9-93 reviewed: deliberately public — wizard template reference data, no show data.';
COMMENT ON POLICY show_visibility_select ON public.show_visibility_settings IS
  'MYK9-93 reviewed: deliberately public — visibility flags are read by anon to decide what to show.';
COMMENT ON POLICY sport_class_rules_select ON public.sport_class_rules IS
  'MYK9-93 reviewed: deliberately public — sport reference data.';
COMMENT ON POLICY sport_templates_select ON public.sport_templates IS
  'MYK9-93 reviewed: deliberately public — sport reference data.';
COMMENT ON POLICY sport_titles_select ON public.sport_titles IS
  'MYK9-93 reviewed: deliberately public — title reference data.';
COMMENT ON POLICY template_fields_select ON public.template_fields IS
  'MYK9-93 reviewed: deliberately public — wizard template reference data.';
COMMENT ON POLICY trial_visibility_select ON public.trial_visibility_overrides IS
  'MYK9-93 reviewed: deliberately public — visibility flags are read by anon to decide what to show.';
COMMENT ON POLICY "Anyone can read user_guide" ON public.user_guide IS
  'MYK9-93 reviewed: deliberately public — help content.';
