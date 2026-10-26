-- MYK9-1409: a role's permission set is written in one transaction.
--
-- The site-admin role editors wrote role_permissions with separate PostgREST calls: a delete,
-- a permissions lookup by code, then an insert. A failure between them left the role with
-- zero permissions while the page reported the save, two overlapping saves could each delete
-- the other's rows, and a role created before its permissions failed could not be saved
-- again under the same name. These two RPCs replace every client write of role_permissions:
--
--   create_role_with_permissions(name, codes, description): the role and its permissions,
--     or nothing.
--   update_role_with_permissions(role_id, description, set_description, codes): locks the
--     role row, so concurrent saves of one role run one after the other, and the last one
--     leaves exactly its own set. NULL codes leave the permissions alone.
--
-- Both refuse a caller who is not a site admin (42501) before anything else, then ask for a
-- recent re-authentication (MKAUT, MYK9-1208). Writes made inside a SECURITY DEFINER
-- function run as its owner, so the direct-write trigger on roles and role_permissions does
-- not fire for them; the explicit require_recent_reauth call is the gate. Unknown or NULL
-- codes are refused (22023) before any write. Each returns the role row and the codes it
-- wrote, in request order without duplicates, so the audit records what was written.

BEGIN;

-- Internal: resolve codes and make the role's role_permissions rows exactly that set.
-- Callable only from the two RPCs below (no grant to any client role).
CREATE OR REPLACE FUNCTION public.replace_role_permission_codes(p_role_id uuid, p_codes text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_codes text[];
  v_unknown text;
BEGIN
  IF array_position(p_codes, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Permission codes must not be null' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(d.code ORDER BY d.ord), '{}')
    INTO v_codes
    FROM (
      SELECT u.code, min(u.ord) AS ord
        FROM unnest(COALESCE(p_codes, '{}')) WITH ORDINALITY AS u(code, ord)
       GROUP BY u.code
    ) d;

  SELECT string_agg(c.code, ', ' ORDER BY c.code)
    INTO v_unknown
    FROM unnest(v_codes) AS c(code)
   WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.code = c.code);

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown permission codes: %', v_unknown USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.role_permissions rp
   WHERE rp.role_id = p_role_id
     AND NOT EXISTS (
       SELECT 1 FROM public.permissions p
        WHERE p.id = rp.permission_id AND p.code = ANY (v_codes)
     );

  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT p_role_id, p.id
    FROM public.permissions p
   WHERE p.code = ANY (v_codes)
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  RETURN v_codes;
END;
$$;

COMMENT ON FUNCTION public.replace_role_permission_codes(uuid, text[]) IS
  'MYK9-1409: internal to create_role_with_permissions / update_role_with_permissions. Refuses NULL or unknown codes (22023), then makes the role''s role_permissions exactly that set; returns the codes in request order without duplicates.';

REVOKE ALL ON FUNCTION public.replace_role_permission_codes(uuid, text[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_role_with_permissions(
  p_name text,
  p_permission_codes text[],
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.roles;
  v_codes text[];
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a site admin can create roles' USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_recent_reauth();

  INSERT INTO public.roles (name, description, is_system)
  VALUES (p_name, p_description, false)
  RETURNING * INTO v_role;

  v_codes := public.replace_role_permission_codes(v_role.id, p_permission_codes);

  RETURN jsonb_build_object('role', to_jsonb(v_role), 'permission_codes', to_jsonb(v_codes));
END;
$$;

COMMENT ON FUNCTION public.create_role_with_permissions(text, text[], text) IS
  'MYK9-1409: site admin only, recent re-auth required. Creates a custom role and its permission set in one transaction; returns { role, permission_codes }.';

REVOKE ALL ON FUNCTION public.create_role_with_permissions(text, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_role_with_permissions(text, text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_role_with_permissions(
  p_role_id uuid,
  p_description text DEFAULT NULL,
  p_set_description boolean DEFAULT false,
  p_permission_codes text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.roles;
  v_codes text[];
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a site admin can edit roles' USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_recent_reauth();

  -- The row lock serializes concurrent saves of one role.
  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role % not found', p_role_id USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(p_set_description, false) THEN
    UPDATE public.roles SET description = p_description WHERE id = p_role_id
    RETURNING * INTO v_role;
  END IF;

  IF p_permission_codes IS NOT NULL THEN
    v_codes := public.replace_role_permission_codes(p_role_id, p_permission_codes);
  END IF;

  RETURN jsonb_build_object('role', to_jsonb(v_role), 'permission_codes', to_jsonb(v_codes));
END;
$$;

COMMENT ON FUNCTION public.update_role_with_permissions(uuid, text, boolean, text[]) IS
  'MYK9-1409: site admin only, recent re-auth required. Locks the role, optionally sets its description, and when p_permission_codes is not NULL makes its permission set exactly those codes, in one transaction; returns { role, permission_codes } (permission_codes NULL when untouched).';

REVOKE ALL ON FUNCTION public.update_role_with_permissions(uuid, text, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_role_with_permissions(uuid, text, boolean, text[]) TO authenticated;

COMMIT;
