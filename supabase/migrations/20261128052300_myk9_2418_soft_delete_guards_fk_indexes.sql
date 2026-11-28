-- MYK9-2418: database hygiene. Four SECURITY DEFINER RPCs read a soft-deleted club or show as
-- live; a soft-deleted one now reads as "not found" through each function's existing error.
-- Bodies are copied from the latest migration that defines each function, changing only that
-- predicate, with each function's GRANT/REVOKE restated. Two foreign keys also get covering
-- indexes (class_judge_departures.resolved_judge_id, platform_settings.payouts_require_approval_changed_by).
-- No behavioral change otherwise; no table or column is added.
BEGIN;

-- 20261119214300_myk9_2065_official_premium_mailing_address.sql
CREATE OR REPLACE FUNCTION public.set_show_official_mailing_address(
  p_show_id uuid,
  p_role_name text,
  p_person_id uuid,
  p_address text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
BEGIN
  IF p_role_name IS NULL OR p_role_name NOT IN ('secretary', 'chairman') THEN
    RAISE EXCEPTION 'only the secretary and chairman carry a premium mailing address'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = p_show_id AND s.deleted_at IS NULL;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'show not found' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to change officials on this show' USING ERRCODE = '42501';
  END IF;

  IF v_address IS NOT NULL AND char_length(v_address) > 500 THEN
    RAISE EXCEPTION 'mailing address is too long' USING ERRCODE = '22001';
  END IF;

  UPDATE public.show_officials
  SET premium_mailing_address = v_address
  WHERE show_id = p_show_id
    AND role = p_role_name
    AND person_id = p_person_id;

  -- The tab that sent this may be showing someone who has since been replaced: write nothing.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This official was changed by someone else. Refresh this page to see who it is now.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_show_official_mailing_address(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_show_official_mailing_address(uuid, text, uuid, text) TO authenticated;

-- 20261120004700_myk9_2209_club_admin_grant_revoke.sql
CREATE OR REPLACE FUNCTION public.grant_club_admin(
  p_club_id uuid,
  p_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_person_id uuid;
  v_role_id uuid;
  v_assignment_id uuid;
BEGIN
  IF NOT private.can_administer_club(p_club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can add an admin'
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-1208: a role change needs a password confirmed in the last five minutes.
  PERFORM public.require_recent_reauth();

  -- Same per-club lock revoke_club_admin takes, so a grant and a removal cannot interleave.
  PERFORM pg_advisory_xact_lock(hashtextextended('club_admin_revoke:' || p_club_id::text, 0));

  -- Re-check under the lock: an admin removed a moment ago must not slip a change through.
  IF NOT private.can_administer_club(p_club_id) THEN
    RAISE EXCEPTION 'Only site admins or this club''s admins can change its admins'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.person_can_sign_in(p_person_id) THEN
    RAISE EXCEPTION 'That person does not have a myK9 account yet.' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'club_admin';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'club_admin role is missing' USING ERRCODE = 'P0002';
  END IF;

  -- Already a club admin (an active, unexpired club-wide row): nothing to add. A show-pinned row
  -- alone does not count, so one is left in place and a club-wide row is added beside it.
  SELECT ur.id INTO v_assignment_id
  FROM public.user_roles ur
  WHERE ur.user_id = p_person_id
    AND ur.role_id = v_role_id
    AND ur.club_id = p_club_id
    AND ur.show_id IS NULL
    AND ur.is_active = true
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
  LIMIT 1;

  IF v_assignment_id IS NOT NULL THEN
    RETURN v_assignment_id;
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  SELECT id INTO v_assignment_id
  FROM public.user_roles
  WHERE user_id = p_person_id
    AND role_id = v_role_id
    AND club_id = p_club_id
    AND show_id IS NULL
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, club_id, granted_by, is_active)
    VALUES (p_person_id, v_role_id, p_club_id, v_actor_person_id, true)
    RETURNING id INTO v_assignment_id;
  ELSE
    UPDATE public.user_roles
    SET is_active = true,
        expires_at = NULL,
        granted_by = v_actor_person_id,
        granted_at = now()
    WHERE id = v_assignment_id;
  END IF;

  INSERT INTO public.permission_audit_log (user_id, action, target_type, target_id, new_value)
  VALUES (
    v_actor_person_id,
    'club_admin_granted',
    'user_role',
    v_assignment_id,
    jsonb_build_object('person_id', p_person_id, 'club_id', p_club_id, 'role', 'club_admin')
  );

  RETURN v_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_club_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_club_admin(uuid, uuid) TO authenticated;

-- 20261119223100_myk9_2197_show_publish_blockers.sql
CREATE OR REPLACE FUNCTION public.club_publish_blockers(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'p_club_id is required' USING ERRCODE = '22023';
  END IF;

  -- The roles that manage a club's shows (can_manage_show's club arms), plus
  -- site admin. is_club_admin / is_trial_secretary read a NULL as "any club",
  -- which the check above rules out.
  IF NOT (public.is_club_admin(p_club_id)
          OR public.is_trial_secretary(p_club_id)
          OR public.is_site_admin()) THEN
    RAISE EXCEPTION 'not authorized to read the publish blockers for club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = p_club_id AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  RETURN coalesce(
    (SELECT jsonb_agg(jsonb_build_object('key', b.key, 'waiting_on', b.waiting_on, 'eta', b.eta)
                      ORDER BY b."position")
       FROM private.club_publish_blockers_for(p_club_id) b),
    '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.club_publish_blockers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.club_publish_blockers(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.club_publish_blockers(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.club_publish_blockers(uuid) TO authenticated;

-- 20261120010900_myk9_2199_club_first_show_published.sql
CREATE OR REPLACE FUNCTION public.club_first_show_state(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_published timestamptz;
  v_draft uuid;
BEGIN
  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'p_club_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_club_admin(p_club_id)
          OR public.is_trial_secretary(p_club_id)
          OR public.is_site_admin()) THEN
    RAISE EXCEPTION 'not authorized to read the first-show state for club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  SELECT c.first_show_published_at INTO v_published
    FROM public.clubs c WHERE c.id = p_club_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id INTO v_draft
    FROM public.shows s
   WHERE s.club_id = p_club_id
     AND s.status = 'draft'
     AND s.deleted_at IS NULL
   ORDER BY s.created_at DESC, s.id DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'published_ever', v_published IS NOT NULL,
    'draft_show_id', v_draft);
END;
$$;

REVOKE ALL ON FUNCTION public.club_first_show_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.club_first_show_state(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.club_first_show_state(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.club_first_show_state(uuid) TO authenticated;

-- Covering indexes for the two unindexed foreign keys (a delete or update of the referenced
-- people row otherwise scans the child table).
CREATE INDEX IF NOT EXISTS class_judge_departures_resolved_judge_id_fk_idx
  ON public.class_judge_departures (resolved_judge_id);
CREATE INDEX IF NOT EXISTS platform_settings_payouts_require_approval_changed_by_fk_idx
  ON public.platform_settings (payouts_require_approval_changed_by);

COMMIT;
