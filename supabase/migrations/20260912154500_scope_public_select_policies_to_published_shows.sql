-- MYK9-469 / SA-2026-09-12-01: four PUBLIC `SELECT ... USING (true)` policies had no
-- show-status, no soft-delete and no ownership predicate, so `anon` read rows belonging to
-- unpublished shows and to dogs it cannot otherwise see.
--
-- Replayed cold against the applied database before this migration (publishable key only, no
-- bearer token) on a show whose status = 'draft':
--
--   GET /rest/v1/shows?id=eq.<draft>                  -> 200 []
--   GET /rest/v1/trials?show_id=eq.<draft>            -> 200 []
--   GET /rest/v1/classes?trial_id=eq.<draft-trial>    -> 200 []
--   GET /rest/v1/judge_assignments?show_id=eq.<draft> -> 200 [ 4 rows ]
--
-- RLS hid the show, its trials and its classes; judge_assignments handed back that same show's
-- id, trial id, class ids, the assigned judges' person_ids and each assignment's status.
-- 4 of 18 live judge_assignments rows were in a non-public show at the time of the audit.
--
-- MYK9-146 already revoked judge_assignments.fee and .notes at the COLUMN level. This migration
-- closes the ROW scope, which that fix did not touch.
--
-- SHAPE — one policy per role, NOT one PUBLIC policy with mixed arms.
-- A first draft of this migration put the public predicate and the staff predicate in a single
-- PUBLIC policy. Codex review caught that this breaks anon outright: `is_show_office_manager()`
-- and `can_manage_show()` have no EXECUTE for anon (verified on the applied database via
-- has_function_privilege), so an anon request that evaluates such a row raises 42501 and fails
-- the WHOLE request instead of filtering the row. Postgres also does not guarantee OR
-- short-circuit order, so even a row that satisfies the public arm could have tripped it.
--
-- Splitting by role removes the hazard structurally rather than relying on evaluation order,
-- and matches the shape `entries` already uses (entries_anon_select_for_tv TO anon,
-- entries_select TO authenticated). Because the two policies target DIFFERENT roles they do not
-- form a multiple-permissive-policies overlap, so this does not add to the MYK9-112 debt.
--
-- Report: docs/security-audit-2026-09-12.md

-- ---------------------------------------------------------------------------
-- judge_assignments
-- ---------------------------------------------------------------------------
-- The public predicate matches what every other anon-reachable table already uses
-- (compare entries_anon_select_for_tv and classes_select).
--
-- The authenticated policy repeats that predicate and adds the arms that keep the surfaces
-- reading this table working for shows that are NOT yet public:
--   * the assigned judge themselves — they must see an assignment to accept or decline it,
--     which by definition happens before the show publishes (useJudgeShowStats reads by
--     person_id + show_id);
--   * show office managers and show officials — the secretary building the show, and the
--     chairman/steward who staff the ring.
-- Every in-app reader filters by a single show_id (useJudgeDayCapacity, useClassAvailability,
-- useShowJudges, judge_day_summary), so no cross-show aggregate loses rows to this narrowing.
DROP POLICY IF EXISTS "judge_assignments_select" ON public.judge_assignments;

CREATE POLICY "judge_assignments_anon_select"
  ON public.judge_assignments
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = judge_assignments.show_id
        AND s.deleted_at IS NULL
        AND s.status = ANY (ARRAY['published', 'upcoming', 'in_progress', 'completed'])
    )
  );

CREATE POLICY "judge_assignments_select"
  ON public.judge_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = judge_assignments.show_id
        AND s.deleted_at IS NULL
        AND s.status = ANY (ARRAY['published', 'upcoming', 'in_progress', 'completed'])
    )
    OR (SELECT public.is_site_admin())
    OR person_id = (SELECT public.get_my_person_id())
    OR (SELECT public.is_show_office_manager(judge_assignments.show_id))
    OR (SELECT public.is_show_official(judge_assignments.show_id))
  );

-- ---------------------------------------------------------------------------
-- armbands
-- ---------------------------------------------------------------------------
-- Same split. 260 rows today, 0 of them in a non-public show — so this is latent rather than
-- live, but armbands are normally assigned while the show is still being built, which is
-- exactly when the old policy published the armband -> dog mapping to anon.
-- Write policies on this table gate on can_manage_show(show_id); the read arms mirror that plus
-- the show officials who need the mapping at ringside.
DROP POLICY IF EXISTS "armbands_select" ON public.armbands;

CREATE POLICY "armbands_anon_select"
  ON public.armbands
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = armbands.show_id
        AND s.deleted_at IS NULL
        AND s.status = ANY (ARRAY['published', 'upcoming', 'in_progress', 'completed'])
    )
  );

CREATE POLICY "armbands_select"
  ON public.armbands
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = armbands.show_id
        AND s.deleted_at IS NULL
        AND s.status = ANY (ARRAY['published', 'upcoming', 'in_progress', 'completed'])
    )
    OR (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_show(armbands.show_id))
    OR (SELECT public.is_show_official(armbands.show_id))
  );

-- ---------------------------------------------------------------------------
-- achievements
-- ---------------------------------------------------------------------------
-- A dog's titles, certificate numbers and free-text notes were world-readable while the dog
-- itself is not: dogs_select is TO authenticated and scoped to owner / co-owner / show manager /
-- handler. There is no public dog surface, so "anyone may read every dog's achievements" was
-- never a deliberate boundary — it is the USING (true) default. No anon arm at all, which also
-- means none of the authenticated-only helpers below is ever reached by anon.
--
-- Deliberately expressed with the SAME arms as dogs_select rather than a new predicate, so the
-- two stay coupled: if you can see the dog, you can see its achievements.
--
-- NOTE: the is_show_manager() arm is inherited from dogs_select, and is_show_manager() is itself
-- the argument-less "any club" helper. Carried over unchanged ON PURPOSE — importing it keeps
-- parity with dogs_select, whose platform-wide staff read is a DOCUMENTED, intentional deferral
-- (20260611120000_tighten_dogs_people_select_rls.sql, "Residual / post-launch hardening":
-- show-scoping needs a per-row helper that caused O(N) statement timeouts, deferred until a
-- denormalized show-visibility index exists). Do NOT scope it here in isolation — that would
-- reintroduce the timeout this repo already paid for once, and would desynchronise the two
-- policies. See MYK9-470.
DROP POLICY IF EXISTS "achievements_select" ON public.achievements;

CREATE POLICY "achievements_select"
  ON public.achievements
  FOR SELECT
  TO authenticated
  USING (
    dog_id IN (
      SELECT d.id
      FROM public.dogs d
      WHERE d.deleted_at IS NULL
        AND (
          d.owner_id = (SELECT public.get_my_person_id())
          OR d.co_owner_id = (SELECT public.get_my_person_id())
        )
    )
    OR (SELECT public.is_show_manager())
    OR dog_id IN (SELECT public.get_my_handled_dog_ids())
  );

-- ---------------------------------------------------------------------------
-- show_templates
-- ---------------------------------------------------------------------------
-- This table carries its own visibility flag (is_public boolean) and a club_id, and the policy
-- ignored both — a club's private template was readable by anon. Writes are already site-admin
-- only. is_public IS TRUE rather than = true so a NULL flag fails closed.
--
-- Split by role for the same reason as above. Every helper used here happens to be
-- anon-executable today (is_club_admin, is_trial_secretary, is_site_admin all have EXECUTE for
-- anon on the applied database), so a single PUBLIC policy would work right now — but that is a
-- grant that could be revoked later, and a uniform shape means the next person to copy one of
-- these policies copies the safe one.
DROP POLICY IF EXISTS "show_templates_select" ON public.show_templates;

CREATE POLICY "show_templates_anon_select"
  ON public.show_templates
  FOR SELECT
  TO anon
  USING (is_public IS TRUE);

CREATE POLICY "show_templates_select"
  ON public.show_templates
  FOR SELECT
  TO authenticated
  USING (
    is_public IS TRUE
    OR (SELECT public.is_site_admin())
    OR (
      club_id IS NOT NULL
      AND (
        (SELECT public.is_club_admin(show_templates.club_id))
        OR (SELECT public.is_trial_secretary(show_templates.club_id))
      )
    )
  );

COMMENT ON POLICY "judge_assignments_anon_select" ON public.judge_assignments IS
  'MYK9-469: anon reads only non-deleted shows in published/upcoming/in_progress/completed. '
  'Kept free of role helpers — anon has no EXECUTE on is_show_office_manager/can_manage_show, '
  'and calling one raises 42501 for the whole request rather than filtering the row.';

COMMENT ON POLICY "judge_assignments_select" ON public.judge_assignments IS
  'MYK9-469: the public predicate, plus the assigned judge, show office managers, show '
  'officials, and site admin.';

COMMENT ON POLICY "armbands_anon_select" ON public.armbands IS
  'MYK9-469: anon reads only non-deleted shows in published/upcoming/in_progress/completed.';

COMMENT ON POLICY "armbands_select" ON public.armbands IS
  'MYK9-469: the public predicate, plus show managers, show officials, and site admin.';

COMMENT ON POLICY "achievements_select" ON public.achievements IS
  'MYK9-469: mirrors dogs_select — if you can see the dog you can see its achievements. '
  'The is_show_manager() arm is inherited from dogs_select, whose platform-wide staff read is a '
  'documented deferral (20260611120000); it tightens with that one, not independently.';

COMMENT ON POLICY "show_templates_anon_select" ON public.show_templates IS
  'MYK9-469: anon reads only templates the table itself marks is_public (NULL fails closed).';

COMMENT ON POLICY "show_templates_select" ON public.show_templates IS
  'MYK9-469: is_public templates plus the owning club''s admin/secretary and site admin.';
