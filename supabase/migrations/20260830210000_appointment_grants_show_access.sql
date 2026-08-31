-- One rule for who may run a club's shows:
--
--   A club appoints its secretaries. Any appointed secretary can run any of that
--   club's shows. Appointment is the only thing that grants access.
--
-- This REVERSES the club-membership half of MYK9-169
-- (20260802120000_enforce_club_membership_role_boundaries.sql), deliberately and
-- with its test rewritten in the same commit. It is not drift repair.
--
-- MYK9-169 and this migration want the same thing and differ only in mechanism.
-- Both exist so a hired non-member can run a club's shows: MYK9-169 granted that
-- per show, leaving club-wide access members-only; this grants it at appointment.
-- The membership coupling had a cost MYK9-169 did not price in — a club admin
-- marking a member 'lapsed' or 'suspended' (routine admin, possibly unpaid dues)
-- silently revoked their ability to run shows, with nothing on screen saying so.
--
-- What MYK9-169 got right and this keeps: membership and authority are different
-- things, and a role lookup must never promote a show-scoped grant to club-wide
-- access.
--
-- Behaviour-preserving on today's data: measured against the live database,
-- 0 rows gain access (4 club-scoped secretary rows, all active members today).
--
-- SECURITY — what must not change here, and does not:
--   * `ur.club_id = check_club_id` stays. Migration 102 removed an
--     `ur.club_id IS NULL` fallback that made a club-less secretary row a
--     PLATFORM-WIDE grant. This migration opens the same WHERE block; the club
--     match, `ur.is_active`, `ur.expires_at` and the constraint trigger
--     `trg_enforce_club_id_for_scoped_roles` all survive untouched.
--   * The write path is unchanged and remains the trust boundary: user_roles has
--     RLS with INSERT/UPDATE/DELETE restricted to is_site_admin(), so club admins
--     can only appoint through grant_club_secretary, which restates
--     `is_site_admin() OR is_club_admin(club)` internally.
--
-- Six functions carry the membership predicate, not the three the plan named.
-- grant_club_secretary is the one that matters most: it REFUSED to appoint a
-- non-member, so leaving it in place would have blocked the entire feature while
-- every read-side helper reported success.

BEGIN;

-- 1. The appointment path. Without this, a club cannot appoint the hired
--    non-member secretary this change exists to serve.
CREATE OR REPLACE FUNCTION public.grant_club_secretary(
  p_person_id uuid,
  p_club_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
  v_secretary_role_id uuid;
  v_assignment_id uuid;
BEGIN
  IF NOT (public.is_site_admin() OR public.is_club_admin(p_club_id)) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can grant secretary access'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'Person % not found', p_person_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  -- Membership is deliberately NOT checked. A professional secretary hired by a
  -- club is typically a member of none of the clubs they work for.

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  SELECT id INTO v_secretary_role_id
  FROM public.roles
  WHERE name = 'secretary';

  IF v_secretary_role_id IS NULL THEN
    RAISE EXCEPTION 'secretary role is missing' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_assignment_id
  FROM public.user_roles
  WHERE user_id = p_person_id
    AND role_id = v_secretary_role_id
    AND club_id = p_club_id
    AND show_id IS NULL
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.user_roles (
      user_id,
      role_id,
      club_id,
      granted_by,
      is_active
    )
    VALUES (
      p_person_id,
      v_secretary_role_id,
      p_club_id,
      v_actor_person_id,
      true
    )
    RETURNING id INTO v_assignment_id;
  ELSE
    UPDATE public.user_roles
    SET is_active = true,
        expires_at = NULL,
        granted_by = v_actor_person_id,
        granted_at = now()
    WHERE id = v_assignment_id;
  END IF;

  INSERT INTO public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  VALUES (
    v_actor_person_id,
    'club_secretary_granted',
    'user_role',
    v_assignment_id,
    jsonb_build_object(
      'person_id', p_person_id,
      'club_id', p_club_id,
      'role', 'secretary'
    )
  );

  RETURN v_assignment_id;
END;
$$;

COMMENT ON FUNCTION public.grant_club_secretary(uuid, uuid) IS
  'Appoints a club secretary. Appointment is the grant; club membership is not required and is not consulted.';

REVOKE EXECUTE ON FUNCTION public.grant_club_secretary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_club_secretary(uuid, uuid) TO authenticated;

-- 2. Club-scoped secretary check.
CREATE OR REPLACE FUNCTION public.is_trial_secretary(check_club_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND r.name IN ('secretary', 'trial_secretary')
      AND ur.is_active = true
      AND ur.show_id IS NULL
      AND (check_club_id IS NULL OR ur.club_id = check_club_id)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

COMMENT ON FUNCTION public.is_trial_secretary(uuid) IS
  'True when the caller holds an active club-scoped secretary appointment. Appointment alone grants; membership is not consulted.';

REVOKE ALL ON FUNCTION public.is_trial_secretary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trial_secretary(uuid) TO anon, authenticated;

-- 3. Show-level secretary check.
CREATE OR REPLACE FUNCTION public.is_show_secretary(check_show_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND ur.is_active
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        r.name = 'site_admin'
        OR (r.name = 'secretary' AND ur.show_id = check_show_id)
        OR (
          r.name = 'secretary'
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.is_show_secretary(uuid) IS
  'True for a site admin, a show-scoped secretary row, or a secretary appointed at the show''s club. Membership is not consulted.';

REVOKE ALL ON FUNCTION public.is_show_secretary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_secretary(uuid) TO anon, authenticated;

-- 4. Show officials. Secretary, chairman and steward now follow ONE rule; before
--    this, secretary alone carried a membership test, so a chairman got in
--    without membership where a secretary did not.
CREATE OR REPLACE FUNCTION public.is_show_official(check_show_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND ur.is_active
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND (
        r.name = 'site_admin'
        OR (r.name IN ('secretary', 'chairman', 'steward') AND ur.show_id = check_show_id)
        OR (
          r.name IN ('secretary', 'chairman', 'steward')
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.is_show_official(uuid) IS
  'True for a site admin or any secretary/chairman/steward holding a show-scoped row or a club appointment at the show''s club. All three staff roles follow one rule.';

REVOKE ALL ON FUNCTION public.is_show_official(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_official(uuid) TO anon, authenticated;

-- 5. Who can manage this club's shows (used for notification fan-out).
CREATE OR REPLACE FUNCTION public.get_club_show_manager_ids(p_club_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT ur.user_id
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.club_id = p_club_id
    AND ur.show_id IS NULL
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    AND r.name = 'secretary';
$$;

COMMENT ON FUNCTION public.get_club_show_manager_ids(uuid) IS
  'People appointed as secretary at this club. Membership is not consulted.';

REVOKE ALL ON FUNCTION public.get_club_show_manager_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_show_manager_ids(uuid) TO authenticated;

-- 6. manageable_show_ids does not itself test membership — it inherits the rule
--    through is_trial_secretary — but its COMMENT stated the old rule, and a
--    stale comment on an authorization helper is how the next reader learns the
--    wrong model. Body unchanged.
COMMENT ON FUNCTION public.manageable_show_ids() IS
  'Set of shows the current caller may manage: club admins, secretaries appointed at the show''s club, site admins, and show-scoped secretary rows. Membership is not consulted.';

-- 7. The cached entry-results authorization context, which folds the same
--    predicate twice (has_manager_role and managed_club_ids).
--
--    CREATE OR REPLACE, never DROP: view_authenticated_entry_results depends on
--    this function, the signature is unchanged, and recreating that view would
--    reset its reloptions and silently flip security_invoker from false.
CREATE OR REPLACE FUNCTION private.entry_results_caller_context()
RETURNS TABLE (
  auth_user_id uuid,
  person_id uuid,
  is_site_admin boolean,
  has_manager_role boolean,
  managed_club_ids uuid[],
  managed_show_ids uuid[],
  assigned_class_ids uuid[],
  steward_show_ids uuid[],
  steward_club_ids uuid[],
  claim_kind text,
  claim_show_id text,
  claim_role text,
  claim_generation_current boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH caller_identity AS MATERIALIZED (
    SELECT
      auth.uid() AS auth_user_id,
      (
        SELECT p.id
        FROM public.people p
        WHERE p.auth_user_id = auth.uid()
        LIMIT 1
      ) AS person_id,
      auth.jwt() AS jwt
  ),
  role_context AS MATERIALIZED (
    SELECT
      COALESCE(bool_or(r.name = 'site_admin'), false) AS is_site_admin,
      COALESCE(
        bool_or(
          r.name = 'club_admin'
          OR (
            r.name IN ('secretary', 'trial_secretary')
            AND ur.show_id IS NULL
          )
        ),
        false
      ) AS has_manager_role,
      COALESCE(array_agg(DISTINCT ur.club_id) FILTER (
        WHERE (
          r.name = 'club_admin'
          OR (
            r.name IN ('secretary', 'trial_secretary')
            AND ur.show_id IS NULL
            AND ur.club_id IS NOT NULL
          )
        )
      ), ARRAY[]::uuid[]) AS managed_club_ids,
      COALESCE(array_agg(DISTINCT ur.show_id) FILTER (
        WHERE r.name IN ('secretary', 'trial_secretary')
          AND ur.show_id IS NOT NULL
      ), ARRAY[]::uuid[]) AS managed_show_ids,
      COALESCE(array_agg(DISTINCT ur.show_id) FILTER (
        WHERE r.name = 'steward'
          AND ur.show_id IS NOT NULL
      ), ARRAY[]::uuid[]) AS steward_show_ids,
      COALESCE(array_agg(DISTINCT ur.club_id) FILTER (
        WHERE r.name = 'steward'
          AND ur.show_id IS NULL
          AND ur.club_id IS NOT NULL
      ), ARRAY[]::uuid[]) AS steward_club_ids
    FROM caller_identity ci
    LEFT JOIN public.user_roles ur
      ON ur.auth_user_id = ci.auth_user_id
     AND ur.is_active
     AND (ur.expires_at IS NULL OR ur.expires_at > now())
    LEFT JOIN public.roles r ON r.id = ur.role_id
  ),
  judge_context AS MATERIALIZED (
    SELECT COALESCE(array_agg(DISTINCT ja.class_id) FILTER (
      WHERE ja.class_id IS NOT NULL
    ), ARRAY[]::uuid[]) AS assigned_class_ids
    FROM caller_identity ci
    LEFT JOIN public.judge_assignments ja
      ON ja.person_id = ci.person_id
     AND ja.status IN ('confirmed', 'invited')
  )
  SELECT
    ci.auth_user_id,
    ci.person_id,
    rc.is_site_admin,
    rc.has_manager_role,
    rc.managed_club_ids,
    rc.managed_show_ids,
    jc.assigned_class_ids,
    rc.steward_show_ids,
    rc.steward_club_ids,
    ci.jwt -> 'app_metadata' ->> 'kind' AS claim_kind,
    nullif(ci.jwt -> 'app_metadata' ->> 'show_id', '') AS claim_show_id,
    ci.jwt -> 'app_metadata' ->> 'ringside_role' AS claim_role,
    public.ringside_claim_generation_current() AS claim_generation_current
  FROM caller_identity ci
  CROSS JOIN role_context rc
  CROSS JOIN judge_context jc;
$$;

COMMENT ON FUNCTION private.entry_results_caller_context() IS
  'Internal MYK9-114 helper. Club manager context requires a club-admin role or a club-scoped secretary appointment; show-scoped officials and judge assignments remain separately scoped. Membership is not consulted.';

-- 8. is_active_club_member survives, uncalled, because membership remains a real
--    thing a club tracks — it is simply no longer an authorization predicate.
--    Left in place (and still REVOKEd from every client role) so the members UI
--    has it; the comment is the guard against it being re-wired into a policy.
COMMENT ON FUNCTION public.is_active_club_member(uuid, uuid) IS
  'Returns true for an active club_members row. Membership only — NOT an authorization predicate. Show access comes from appointment (see grant_club_secretary); do not reintroduce this into an RLS helper.';

NOTIFY pgrst, 'reload schema';

COMMIT;
