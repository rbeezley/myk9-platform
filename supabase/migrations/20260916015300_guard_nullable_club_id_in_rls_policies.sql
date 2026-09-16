-- MYK9-585: stop handing a nullable club_id to a club-scoped helper from inside
-- an RLS policy.
--
-- `is_club_admin(check_club_id uuid DEFAULT NULL)` and
-- `is_trial_secretary(check_club_id uuid DEFAULT NULL)` both answer the
-- NO-ARGUMENT question "is this user a club admin / club secretary ANYWHERE?"
-- when the argument is NULL:
--
--     AND (check_club_id IS NULL OR ur.club_id = check_club_id)
--
-- ~115 call sites depend on that wildcard, so the helpers are not changing.
-- `shows.club_id` is nullable, which means every policy arm that passes it
-- positionally reads, at runtime, as "any club admin / any club secretary on the
-- platform" for a club-less row. For `shows_update` and `shows_delete` that is a
-- cross-tenant WRITE.
--
-- MYK9-258 fixed the FUNCTIONS (manageable_show_ids, can_manage_show, ...) in
-- 20260828230000 and MYK9-470 fixed seven more in 20260912171500. Nobody had
-- scanned RLS policy bodies for the same call until MYK9-571 extended
-- `apps/myk9show/src/test/database/nullClubShowAuthorizationContract.test.ts`
-- to walk `CREATE/ALTER POLICY` bodies; that scan surfaced these 16 policies
-- (31 individual helper calls) and registered them so the test shipped green.
-- Registration is not remediation. This migration is the remediation.
--
-- THE IDIOM, unchanged from get_show_officials (which always had it) and from
-- shows_select (20260823190000):
--
--     <alias>.club_id IS NOT NULL AND <helper>(<alias>.club_id)
--
-- placed in the helper call's OWN boolean branch, so a club-less row reaches
-- nobody through the club arm. The site-admin / platform-admin arms are
-- untouched and remain the only way to a club-less row.
--
-- WHY `ALTER POLICY` AND NOT DROP + CREATE. Postgres has no
-- `CREATE OR REPLACE POLICY`, and this codebase's usual answer is drop then
-- recreate. `ALTER POLICY ... USING/WITH CHECK` REPLACES the predicate outright
-- (it does not merge), preserves the policy's command and role list, and leaves
-- no window in which the table is unprotected -- the same reasoning
-- 20260727130000_rls_initplan_wrap_auth_calls.sql gives for its own 71 ALTERs.
-- Every predicate below was copied from the LATEST migration that defines that
-- policy and verified against `pg_policies` on the linked database
-- (sojmvhhwsjxmfistvzbe) before the guard was added; only the guard changed.
--
-- NOT TOUCHED, and why:
--   * entry_status_history_select (20260716120000) and show_templates_select
--     (20260912154500) already carry the guard. They were mis-annotated as
--     unguarded in the registry; the test comment is corrected instead.
--   * club_members_*, club_officers_*, club_stripe_accounts_select,
--     "club members can ..." (premium): those tables declare
--     `club_id uuid not null`, verified against
--     `information_schema.columns.is_nullable` on the linked database. No guard
--     is possible or needed.
--   * The helpers themselves. Changing the NULL wildcard would silently alter
--     ~115 unrelated call sites.
--
-- No objects are created, so no GRANT/REVOKE applies: `ALTER POLICY` does not
-- change table or column privileges.
--
-- Behavioural coverage: supabase/tests/null_club_policy_authorization_test.sql
-- (registered in scripts/qa/run-behavioral-sql-tests.sh; runs in CI only).

-- ONE TRANSACTION, NOT SIXTEEN STATEMENTS. Without the wrapper a failure on,
-- say, the ninth ALTER leaves `shows_*` guarded and the message and visibility
-- policies not — a half-applied authorization change, and the migration version
-- row never lands, so the next `db push` replays the first eight against the
-- state they already produced. 20260611090000 and 20260823190000 use the same
-- begin/commit wrapper for the same reason.
begin;

-- ---------------------------------------------------------------------------
-- shows -- the table that owns the nullable column. Both write policies here
-- were cross-tenant writes for a club-less row.
-- ---------------------------------------------------------------------------

-- Latest definition: 135_allow_secretary_create_show.sql
ALTER POLICY shows_insert ON public.shows
  WITH CHECK (
    (shows.club_id IS NOT NULL AND (SELECT public.is_club_admin(shows.club_id)))
    OR (shows.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(shows.club_id)))
    OR (SELECT public.is_site_admin())
  );

-- Latest definition: 20260515110000_fix_shows_soft_delete_rls.sql
ALTER POLICY shows_update ON public.shows
  USING (
    (shows.club_id IS NOT NULL AND (SELECT public.is_club_admin(shows.club_id)))
    OR (shows.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(shows.club_id)))
    OR (SELECT public.is_site_admin())
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (shows.club_id IS NOT NULL AND (SELECT public.is_club_admin(shows.club_id)))
    OR (shows.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(shows.club_id)))
    OR (SELECT public.is_site_admin())
    OR (SELECT public.is_platform_admin())
  );

-- Latest definition: 016_fix_permissive_rls_policies.sql
ALTER POLICY shows_delete ON public.shows
  USING (
    (shows.club_id IS NOT NULL AND (SELECT public.is_club_admin(shows.club_id)))
    OR (SELECT public.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- trials / classes -- the club arm is one and two joins away from shows, and
-- both policies are granted to PUBLIC (anon included). The published-status arm
-- is what legitimately exposes a club-less show's schedule; the club arm must
-- not.
-- ---------------------------------------------------------------------------

-- Latest definition: 108_tv_display_anon_access.sql
ALTER POLICY trials_select ON public.trials
  USING (
    trials.show_id IN (
      SELECT s.id
      FROM public.shows s
      WHERE (
          s.status IN ('published', 'upcoming', 'in_progress', 'completed')
          AND s.deleted_at IS NULL
        )
        OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
        OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
        OR (SELECT public.is_platform_admin())
    )
  );

-- Latest definition: 108_tv_display_anon_access.sql
ALTER POLICY classes_select ON public.classes
  USING (
    classes.deleted_at IS NULL
    AND classes.trial_id IN (
      SELECT t.id
      FROM public.trials t
      JOIN public.shows s ON s.id = t.show_id
      WHERE (
          s.status IN ('published', 'upcoming', 'in_progress', 'completed')
          AND s.deleted_at IS NULL
        )
        OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
        OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
        OR (SELECT public.is_platform_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- show_message_threads / show_messages -- private exhibitor correspondence.
-- The participant arm is untouched; only the show-staff arm is guarded.
--
-- Latest definition for all five: 20260727130000_rls_initplan_wrap_auth_calls.sql
-- (an ALTER POLICY migration; its shape, including the unwrapped
-- is_platform_admin()/helper calls, is preserved apart from the guard).
-- ---------------------------------------------------------------------------

ALTER POLICY threads_select ON public.show_message_threads
  USING (
    show_message_threads.participant_id = (SELECT auth.uid())
    OR is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = show_message_threads.show_id
        AND s.club_id IS NOT NULL
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
    )
  );

ALTER POLICY threads_insert ON public.show_message_threads
  WITH CHECK (
    show_message_threads.participant_id = (SELECT auth.uid())
    OR is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = show_message_threads.show_id
        AND s.club_id IS NOT NULL
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
    )
  );

ALTER POLICY messages_select ON public.show_messages
  USING (
    EXISTS (
      SELECT 1
      FROM public.show_message_threads t
      WHERE t.id = show_messages.thread_id
        AND (
          t.participant_id = (SELECT auth.uid())
          OR is_platform_admin()
          OR EXISTS (
            SELECT 1
            FROM public.shows s
            WHERE s.id = t.show_id
              AND s.club_id IS NOT NULL
              AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
          )
        )
    )
  );

ALTER POLICY messages_insert ON public.show_messages
  WITH CHECK (
    show_messages.sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.show_message_threads t
      WHERE t.id = show_messages.thread_id
        AND (
          t.participant_id = (SELECT auth.uid())
          OR is_platform_admin()
          OR EXISTS (
            SELECT 1
            FROM public.shows s
            WHERE s.id = t.show_id
              AND s.club_id IS NOT NULL
              AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
          )
        )
    )
  );

ALTER POLICY messages_update_read ON public.show_messages
  USING (
    EXISTS (
      SELECT 1
      FROM public.show_message_threads t
      WHERE t.id = show_messages.thread_id
        AND (
          t.participant_id = (SELECT auth.uid())
          OR is_platform_admin()
          OR EXISTS (
            SELECT 1
            FROM public.shows s
            WHERE s.id = t.show_id
              AND s.club_id IS NOT NULL
              AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.show_message_threads t
      WHERE t.id = show_messages.thread_id
        AND (
          t.participant_id = (SELECT auth.uid())
          OR is_platform_admin()
          OR EXISTS (
            SELECT 1
            FROM public.shows s
            WHERE s.id = t.show_id
              AND s.club_id IS NOT NULL
              AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- show / trial / class visibility overrides -- secretary-facing write surfaces
-- that decide what the public sees. Latest definition for all six:
-- 060_show_settings.sql.
-- ---------------------------------------------------------------------------

ALTER POLICY show_visibility_insert ON public.show_visibility_settings
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = show_visibility_settings.show_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (SELECT public.is_platform_admin())
        )
    )
  );

ALTER POLICY show_visibility_update ON public.show_visibility_settings
  USING (
    EXISTS (
      SELECT 1
      FROM public.shows s
      WHERE s.id = show_visibility_settings.show_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (SELECT public.is_platform_admin())
        )
    )
  );

ALTER POLICY trial_visibility_insert ON public.trial_visibility_overrides
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.trials t
      JOIN public.shows s ON s.id = t.show_id
      WHERE t.id = trial_visibility_overrides.trial_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (SELECT public.is_platform_admin())
        )
    )
  );

ALTER POLICY trial_visibility_update ON public.trial_visibility_overrides
  USING (
    EXISTS (
      SELECT 1
      FROM public.trials t
      JOIN public.shows s ON s.id = t.show_id
      WHERE t.id = trial_visibility_overrides.trial_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (SELECT public.is_platform_admin())
        )
    )
  );

ALTER POLICY class_visibility_insert ON public.class_visibility_overrides
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
      JOIN public.shows s ON s.id = t.show_id
      WHERE c.id = class_visibility_overrides.class_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (SELECT public.is_platform_admin())
        )
    )
  );

ALTER POLICY class_visibility_update ON public.class_visibility_overrides
  USING (
    EXISTS (
      SELECT 1
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
      JOIN public.shows s ON s.id = t.show_id
      WHERE c.id = class_visibility_overrides.class_id
        AND (
          (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
          OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
          OR (SELECT public.is_platform_admin())
        )
    )
  );

commit;
