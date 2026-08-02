-- MYK9-169: enforce the distinction between club membership, club-scoped
-- secretary access, show-scoped officials, and judge assignments.
--
-- Club-scoped secretary access requires an active club_members row. Explicit
-- show-scoped secretary assignments remain valid for non-members, and judge
-- authorization continues to use judge_assignments rather than membership.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_club_member(
  p_person_id uuid,
  p_club_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.person_id = p_person_id
      AND cm.club_id = p_club_id
      AND cm.membership_status = 'active'
  );
$$;

COMMENT ON FUNCTION public.is_active_club_member(uuid, uuid) IS
  'MYK9-169: returns true only for an active club_members row; membership is distinct from RBAC roles.';

REVOKE ALL ON FUNCTION public.is_active_club_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

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

  IF NOT public.is_active_club_member(p_person_id, p_club_id) THEN
    RAISE EXCEPTION 'Club secretary access requires an active club membership for person % in club %',
      p_person_id, p_club_id USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.grant_club_secretary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_club_secretary(uuid, uuid) TO authenticated;

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
      AND (
        ur.club_id IS NULL
        OR public.is_active_club_member(ur.user_id, ur.club_id)
      )
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

REVOKE ALL ON FUNCTION public.is_trial_secretary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trial_secretary(uuid) TO anon, authenticated;

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
          AND public.is_active_club_member(ur.user_id, ur.club_id)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_show_secretary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_secretary(uuid) TO anon, authenticated;

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
          r.name IN ('chairman', 'steward')
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
        )
        OR (
          r.name = 'secretary'
          AND ur.show_id IS NULL
          AND ur.club_id = (SELECT club_id FROM public.shows WHERE id = check_show_id)
          AND public.is_active_club_member(ur.user_id, ur.club_id)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_show_official(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_official(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.manageable_show_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id
  FROM public.shows s
  WHERE (SELECT public.is_club_admin(s.club_id))
     OR (SELECT public.is_trial_secretary(s.club_id))
     OR (SELECT public.is_site_admin())
     OR EXISTS (
       SELECT 1
       FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.auth_user_id = auth.uid()
         AND r.name = 'secretary'
         AND ur.show_id = s.id
         AND ur.is_active = true
         AND (ur.expires_at IS NULL OR ur.expires_at > now())
     );
$$;

COMMENT ON FUNCTION public.manageable_show_ids() IS
  'Set of shows the current caller may manage. Club-scoped secretary rows require active club membership; show-scoped secretary rows remain limited to their assigned show.';

REVOKE ALL ON FUNCTION public.manageable_show_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manageable_show_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.manageable_show_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manageable_show_ids() TO service_role;

CREATE OR REPLACE FUNCTION public.is_show_office_manager(check_show_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shows s
    WHERE s.id = check_show_id
      AND (
        (SELECT public.is_site_admin())
        OR (SELECT public.is_club_admin(s.club_id))
        OR (SELECT public.is_trial_secretary(s.club_id))
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.auth_user_id = auth.uid()
            AND ur.is_active = true
            AND (ur.expires_at IS NULL OR ur.expires_at > now())
            AND r.name IN ('secretary', 'trial_secretary')
            AND ur.show_id = check_show_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_show_office_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_show_office_manager(uuid) TO authenticated, service_role;

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
    AND public.is_active_club_member(ur.user_id, ur.club_id)
    AND r.name = 'secretary';
$$;

REVOKE ALL ON FUNCTION public.get_club_show_manager_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_show_manager_ids(uuid) TO authenticated;

-- Keep the cached entry-results authorization context aligned with the shared
-- predicates. Without this replacement, a show-scoped secretary row whose
-- club_id is populated would still appear as a club manager in the view.
DROP VIEW IF EXISTS public.view_authenticated_entry_results;
DROP FUNCTION IF EXISTS private.entry_results_caller_context();

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
            AND (
              ur.club_id IS NULL
              OR public.is_active_club_member(ur.user_id, ur.club_id)
            )
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
            AND public.is_active_club_member(ur.user_id, ur.club_id)
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
  'Internal MYK9-114/MYK9-169 helper. Club manager context requires a club-admin role or an active club-scoped secretary role; show-scoped officials and judge assignments remain separately scoped.';

NOTIFY pgrst, 'reload schema';

COMMIT;
