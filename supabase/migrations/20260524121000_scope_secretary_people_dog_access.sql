-- Scope people/dog write access to shows the current manager can actually manage.
--
-- Broad role checks in people/dogs RLS let any approved secretary create or update
-- people and dogs platform-wide. These helpers keep direct owner self-service
-- intact while moving show-manager creation through show-scoped RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_show_person(check_person_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.entries e
    LEFT JOIN public.dogs d ON d.id = e.dog_id
    WHERE e.deleted_at IS NULL
      AND e.show_id IS NOT NULL
      AND (
        e.handler_id = check_person_id
        OR d.owner_id = check_person_id
        OR d.co_owner_id = check_person_id
      )
      AND public.can_manage_show(e.show_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_show_dog(check_dog_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.entries e
    WHERE e.deleted_at IS NULL
      AND e.show_id IS NOT NULL
      AND e.dog_id = check_dog_id
      AND public.can_manage_show(e.show_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.create_show_managed_person(
  p_show_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF NOT public.can_manage_show(p_show_id) THEN
    RAISE EXCEPTION 'Permission denied for show %', p_show_id USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.people (
    first_name,
    last_name,
    email,
    phone,
    status
  )
  VALUES (
    btrim(p_first_name),
    btrim(p_last_name),
    NULLIF(btrim(p_email), ''),
    NULLIF(btrim(p_phone), ''),
    'active'
  )
  RETURNING id INTO v_person_id;

  RETURN v_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_show_managed_dog(
  p_show_id uuid,
  p_owner_id uuid,
  p_name text,
  p_breed text,
  p_call_name text DEFAULT NULL,
  p_sex text DEFAULT NULL,
  p_akc_number text DEFAULT NULL,
  p_ukc_number text DEFAULT NULL,
  p_microchip_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dog_id uuid;
BEGIN
  IF NOT public.can_manage_show(p_show_id) THEN
    RAISE EXCEPTION 'Permission denied for show %', p_show_id USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.dogs (
    owner_id,
    name,
    breed,
    call_name,
    sex,
    akc_number,
    ukc_number,
    microchip_number,
    status
  )
  VALUES (
    p_owner_id,
    btrim(p_name),
    btrim(p_breed),
    NULLIF(btrim(p_call_name), ''),
    NULLIF(btrim(p_sex), ''),
    NULLIF(btrim(p_akc_number), ''),
    NULLIF(btrim(p_ukc_number), ''),
    NULLIF(btrim(p_microchip_number), ''),
    'active'
  )
  RETURNING id INTO v_dog_id;

  RETURN v_dog_id;
END;
$$;

DROP POLICY IF EXISTS "people_select" ON public.people;
CREATE POLICY "people_select" ON public.people
  FOR SELECT TO authenticated
  USING (
    (
      deleted_at IS NULL
      AND (
        auth_user_id = (SELECT auth.uid())
        OR (SELECT public.can_manage_show_person(people.id))
        OR (SELECT public.is_site_admin())
      )
    )
    OR (SELECT public.is_site_admin())
  );

DROP POLICY IF EXISTS "people_insert" ON public.people;
CREATE POLICY "people_insert" ON public.people
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT public.is_site_admin())
  );

DROP POLICY IF EXISTS "people_update_privileged" ON public.people;
CREATE POLICY "people_update_privileged" ON public.people
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.can_manage_show_person(people.id))
    OR (SELECT public.is_site_admin())
  )
  WITH CHECK (
    (SELECT public.can_manage_show_person(people.id))
    OR (SELECT public.is_site_admin())
  );

CREATE OR REPLACE FUNCTION public.people_protect_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF public.can_manage_show_person(OLD.id) OR public.is_site_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Permission denied: status can only be changed by show managers or site admins'
    USING ERRCODE = '42501';
END;
$$;

DROP POLICY IF EXISTS "dogs_select" ON public.dogs;
CREATE POLICY "dogs_select" ON public.dogs
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_id = (SELECT public.get_my_person_id())
      OR co_owner_id = (SELECT public.get_my_person_id())
      OR (SELECT public.can_manage_show_dog(dogs.id))
      OR (SELECT public.has_role('judge'::text))
      OR (SELECT public.is_site_admin())
    )
  );

DROP POLICY IF EXISTS "dogs_insert" ON public.dogs;
CREATE POLICY "dogs_insert" ON public.dogs
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT public.get_my_person_id())
    OR co_owner_id = (SELECT public.get_my_person_id())
    OR (SELECT public.is_site_admin())
  );

DROP POLICY IF EXISTS "dogs_update" ON public.dogs;
CREATE POLICY "dogs_update" ON public.dogs
  FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT public.get_my_person_id())
    OR co_owner_id = (SELECT public.get_my_person_id())
    OR (SELECT public.can_manage_show_dog(dogs.id))
    OR (SELECT public.is_site_admin())
  )
  WITH CHECK (
    owner_id = (SELECT public.get_my_person_id())
    OR co_owner_id = (SELECT public.get_my_person_id())
    OR (SELECT public.can_manage_show_dog(dogs.id))
    OR (SELECT public.is_site_admin())
  );

GRANT EXECUTE ON FUNCTION public.can_manage_show_person(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_show_dog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_show_managed_person(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_show_managed_dog(uuid, uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.people_protect_status() TO authenticated;

COMMIT;
