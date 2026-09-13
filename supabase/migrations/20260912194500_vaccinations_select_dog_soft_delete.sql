-- MYK9-475: vaccinations_select's owner arm omitted the dog soft-delete filter that its two
-- siblings on the same object graph both apply.
--
-- Before:
--   dog_id IN (SELECT d.id FROM dogs d WHERE d.owner_id = me OR d.co_owner_id = me)
--   OR is_platform_admin()
--   OR EXISTS (entries for this dog in a show I am secretary of)   -- MYK9-470
--
-- The owner arm has no `deleted_at IS NULL`, so an owner could read the vaccination records of
-- their own soft-deleted dog while being unable to see the dog itself (dogs_select gates on it).
--
-- Its siblings:
--   dogs_select          deleted_at IS NULL AND (owner OR co_owner OR is_show_manager() OR handled)
--   achievements_select   one EXISTS over dogs.id with deleted_at IS NULL AND-ed over EVERY arm,
--                         rewritten that way by MYK9-469 precisely because a draft guarding only
--                         the owner arm let a show manager read a soft-deleted dog's records
--
-- Low impact: the reader is the dog's own owner seeing their own data, and vaccinations is empty
-- on the applied database. It is worth fixing because the inconsistency is now VISIBLE — two
-- adjacent policies disagreeing about whether soft-delete gates a read — and because anyone
-- copying vaccinations_select as a template inherits the wrong shape.
--
-- Written as ONE correlated EXISTS on dogs.id, matching achievements_select's post-MYK9-469 form,
-- so soft-delete gates the dog-derived arms BY CONSTRUCTION rather than by restating the filter
-- in each one and hoping they stay in step.
--
-- Performance note, same as MYK9-470's: the EXISTS correlates only on dogs.id (the primary key),
-- and the secretary arm's set helper stays UNCORRELATED so Postgres keeps hoisting it into a
-- per-statement InitPlan. Do NOT rewrite either as a per-row can_manage_show(<row>) — that is the
-- 20260611120000 statement-timeout shape.
--
-- DELIBERATELY UNCHANGED, so this stays a one-property fix:
--   * is_platform_admin() is kept rather than swapped for the canonical is_site_admin(). They are
--     identical (is_platform_admin() is a one-line wrapper), so the swap would be pure churn
--     inside a policy migration. MYK9-475 called it out as optional; declining it.
--   * The MYK9-470 secretary arm keeps its own `e.deleted_at IS NULL` on ENTRIES and gains the
--     dog-level filter by sitting inside the new EXISTS.
--   * vaccinations INSERT/UPDATE/DELETE are untouched — they carry a
--     has_effective_premium_access() arm that is none of this migration's business.

DROP POLICY IF EXISTS "vaccinations_select" ON public.vaccinations;

CREATE POLICY "vaccinations_select"
  ON public.vaccinations
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR EXISTS (
      SELECT 1
      FROM public.dogs d
      WHERE d.id = vaccinations.dog_id
        AND d.deleted_at IS NULL
        AND (
          d.owner_id = (SELECT public.get_my_person_id())
          OR d.co_owner_id = (SELECT public.get_my_person_id())
          OR EXISTS (
            SELECT 1
            FROM public.entries e
            WHERE e.dog_id = d.id
              AND e.deleted_at IS NULL
              AND e.show_id IN (SELECT public.trial_secretary_show_ids())
          )
        )
    )
  );

COMMENT ON POLICY "vaccinations_select" ON public.vaccinations IS
  'MYK9-475: platform admin, or a non-deleted dog the caller owns/co-owns or has actively entered '
  'in a show they are trial secretary of. The dog soft-delete filter AND-s over every dog-derived '
  'arm by construction, matching dogs_select and achievements_select. The secretary arm uses the '
  'UNCORRELATED trial_secretary_show_ids() (MYK9-470) — do not rewrite as per-row '
  'can_manage_show(), which is the 20260611120000 timeout shape.';
