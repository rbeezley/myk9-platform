-- Role request approval flow.
--
-- Signup can capture elevated-role intent, but it must never grant elevated
-- access directly. Requests are recorded here and site admins review them.

BEGIN;

CREATE TABLE public.role_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  requested_role text NOT NULL CHECK (requested_role IN ('club_admin', 'secretary')),
  requested_scope text NOT NULL DEFAULT 'club' CHECK (requested_scope IN ('club', 'show')),
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  show_id uuid REFERENCES public.shows(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  requester_note text,
  reviewer_note text,
  reviewed_by uuid REFERENCES public.people(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX role_requests_auth_user_id_idx ON public.role_requests(auth_user_id);
CREATE INDEX role_requests_person_id_idx ON public.role_requests(person_id);
CREATE INDEX role_requests_status_created_at_idx ON public.role_requests(status, created_at DESC);

CREATE UNIQUE INDEX role_requests_one_pending_scope_idx
  ON public.role_requests (
    person_id,
    requested_role,
    requested_scope,
    COALESCE(club_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(show_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'pending';

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.role_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.role_requests TO service_role;

CREATE POLICY "Users can view their own role requests"
  ON public.role_requests
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = auth_user_id);

CREATE POLICY "Site admins can view role requests"
  ON public.role_requests
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_site_admin()));

CREATE POLICY "Users can submit their own pending role requests"
  ON public.role_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = auth_user_id
    AND person_id = (SELECT public.get_my_person_id())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

CREATE POLICY "Site admins can update role requests"
  ON public.role_requests
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_site_admin()))
  WITH CHECK ((SELECT public.is_site_admin()));

CREATE OR REPLACE FUNCTION public.touch_role_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_role_requests_updated_at
  BEFORE UPDATE ON public.role_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_role_requests_updated_at();

CREATE OR REPLACE FUNCTION public.insert_signup_role_requests(
  p_auth_user_id uuid,
  p_person_id uuid,
  p_intended_roles jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_requested_role text;
BEGIN
  IF p_auth_user_id IS NULL OR p_person_id IS NULL OR jsonb_typeof(p_intended_roles) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_role IN SELECT jsonb_array_elements_text(p_intended_roles)
  LOOP
    v_requested_role := CASE v_role
      WHEN 'club_officer' THEN 'club_admin'
      WHEN 'secretary' THEN 'secretary'
      ELSE NULL
    END;

    IF v_requested_role IS NOT NULL THEN
      INSERT INTO public.role_requests (
        auth_user_id,
        person_id,
        requested_role,
        requested_scope,
        requester_note
      ) VALUES (
        p_auth_user_id,
        p_person_id,
        v_requested_role,
        'club',
        'Created from signup role intent.'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_signup_role_requests(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_signup_role_requests(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.insert_signup_role_requests(uuid, uuid, jsonb) FROM authenticated;

CREATE OR REPLACE FUNCTION public.approve_role_request(
  p_request_id uuid,
  p_club_id uuid,
  p_show_id uuid DEFAULT NULL,
  p_reviewer_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.role_requests%ROWTYPE;
  v_reviewer_person_id uuid;
  v_role_id uuid;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Only site admins can approve role requests'
      USING ERRCODE = '42501';
  END IF;

  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'A club is required before approving this role request'
      USING ERRCODE = '23514';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people
  WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_request
  FROM public.role_requests
  WHERE id = p_request_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending role request was not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_role_id
  FROM public.roles
  WHERE name = v_request.requested_role;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Requested role "%" does not exist', v_request.requested_role
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_roles
  SET is_active = true,
      granted_at = now(),
      granted_by = v_reviewer_person_id
  WHERE user_id = v_request.person_id
    AND role_id = v_role_id
    AND club_id = p_club_id
    AND ((show_id IS NULL AND p_show_id IS NULL) OR show_id = p_show_id);

  IF NOT FOUND THEN
    INSERT INTO public.user_roles (
      user_id,
      role_id,
      club_id,
      show_id,
      is_active,
      granted_at,
      granted_by
    ) VALUES (
      v_request.person_id,
      v_role_id,
      p_club_id,
      p_show_id,
      true,
      now(),
      v_reviewer_person_id
    );
  END IF;

  UPDATE public.role_requests
  SET status = 'approved',
      club_id = p_club_id,
      show_id = p_show_id,
      reviewer_note = p_reviewer_note,
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now()
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deny_role_request(
  p_request_id uuid,
  p_reviewer_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reviewer_person_id uuid;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Only site admins can deny role requests'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_reviewer_person_id
  FROM public.people
  WHERE auth_user_id = (SELECT auth.uid());

  IF v_reviewer_person_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer profile was not found'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.role_requests
  SET status = 'denied',
      reviewer_note = p_reviewer_note,
      reviewed_by = v_reviewer_person_id,
      reviewed_at = now()
  WHERE id = p_request_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending role request was not found'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_role_request(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deny_role_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_person_id UUID;
  new_person_id      UUID;
  exhibitor_role_id  UUID;
BEGIN
  SELECT id INTO exhibitor_role_id
    FROM public.roles
    WHERE name = 'exhibitor';

  SELECT id INTO existing_person_id
    FROM public.people
    WHERE LOWER(email) = LOWER(NEW.email)
      AND auth_user_id IS NULL
      AND deleted_at IS NULL
    LIMIT 1;

  IF existing_person_id IS NOT NULL THEN
    UPDATE public.people SET
      auth_user_id    = NEW.id,
      first_name      = COALESCE(NEW.raw_user_meta_data->>'first_name', first_name),
      last_name       = COALESCE(NEW.raw_user_meta_data->>'last_name', last_name),
      phone           = COALESCE(NEW.raw_user_meta_data->>'phone', phone),
      agreed_to_tos_at = COALESCE(agreed_to_tos_at, NOW()),
      updated_at      = now()
    WHERE id = existing_person_id;

    new_person_id := existing_person_id;
  ELSE
    INSERT INTO public.people (
      first_name,
      last_name,
      email,
      phone,
      auth_user_id,
      agreed_to_tos_at
    ) VALUES (
      COALESCE(NEW.raw_user_meta_data->>'first_name', 'Unknown'),
      COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
      NEW.email,
      NEW.raw_user_meta_data->>'phone',
      NEW.id,
      NOW()
    )
    RETURNING id INTO new_person_id;
  END IF;

  INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
  VALUES (new_person_id, NEW.id)
  ON CONFLICT (auth_user_id) DO NOTHING;

  IF exhibitor_role_id IS NOT NULL THEN
    UPDATE public.user_roles
      SET is_active = true
      WHERE user_id  = new_person_id
        AND role_id  = exhibitor_role_id
        AND club_id  IS NULL
        AND show_id  IS NULL;

    IF NOT FOUND THEN
      INSERT INTO public.user_roles (user_id, role_id, is_active)
      VALUES (new_person_id, exhibitor_role_id, true);
    END IF;
  END IF;

  PERFORM public.insert_signup_role_requests(
    NEW.id,
    new_person_id,
    COALESCE(NEW.raw_user_meta_data->'intended_roles', '[]'::jsonb)
  );

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
