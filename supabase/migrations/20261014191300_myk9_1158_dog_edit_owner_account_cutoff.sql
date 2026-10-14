-- MYK9-1158 (security audit 2026-10-14, SA-2026-10-14-04; owner decision 2026-10-14):
-- a dog becomes its owner's record once the owner signs up, as a person does.
--
-- 20261012224900 (MYK9-1127) let a secretary edit a dog she brought in (created_by) or
-- one created from a show she manages (created_from_show_id). person_edit_allowed()
-- (20261013143900, MYK9-1134) grants the same two arms only while the person has no
-- sign-in account; dog_edit_allowed() had no such cut-off, so the secretary who keyed a
-- mail-in dog, and every manager of its origin show, kept UPDATE on it forever, and no
-- trigger stopped them re-owning it (owner_id / co_owner_id) after the exhibitor had
-- claimed it.
--
-- 1. public.dog_has_account_holder(owner, co-owner): true when either person has a
--    sign-in account. SECURITY DEFINER so the answer never depends on the caller's
--    people_select (a caller who cannot see the owner must not read "no account").
--
-- 2. dog_edit_allowed(): the created_from_show_id and created_by arms now apply only
--    while NEITHER the owner nor the co-owner has an account. Copied from
--    20261012224900, the only and latest definition; every other arm is unchanged
--    (owner, co-owner, site admin, a manager of a show the dog is entered in).
--
-- 3. private.dogs_guard_owner_change(): an API-role UPDATE that changes owner_id or
--    co_owner_id of a dog whose current owner or co-owner has an account is refused
--    (42501) unless the caller is that owner or co-owner, or a site admin. The one
--    arm that still reaches such a dog for anybody else is "manages a show it is
--    entered in"; that manager may correct the dog's details but not hand it to
--    someone else. A dog whose owners have no account (a mail-in record) has nobody to
--    protect, so staff who may edit it may still correct its owner. SECURITY DEFINER
--    RPCs and service-role writes run as their owner and pass, as in the MYK9-1045 and
--    MYK9-1159 guards.
--
-- Behavioral test: supabase/tests/dogs_update_secretary_created_dogs_test.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.dog_has_account_holder(p_owner_id uuid, p_co_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.id IN (p_owner_id, p_co_owner_id)
      AND p.auth_user_id IS NOT NULL
  );
$function$;

COMMENT ON FUNCTION public.dog_has_account_holder(uuid, uuid) IS
  'MYK9-1158: true when the dog''s owner or co-owner has a sign-in account; the creator and origin-show edit arms stop, and its ownership is frozen against non-owners, from then on.';

REVOKE EXECUTE ON FUNCTION public.dog_has_account_holder(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dog_has_account_holder(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dog_edit_allowed(
  p_dog_id uuid,
  p_owner_id uuid,
  p_co_owner_id uuid,
  p_created_by uuid,
  p_created_from_show_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    (p_owner_id IS NOT NULL AND p_owner_id = (SELECT public.get_my_person_id()))
    OR (p_co_owner_id IS NOT NULL AND p_co_owner_id = (SELECT public.get_my_person_id()))
    OR (SELECT public.is_site_admin())
    OR public.can_manage_show_dog(p_dog_id)
    OR (
      NOT public.dog_has_account_holder(p_owner_id, p_co_owner_id)
      AND (
        (
          p_created_from_show_id IS NOT NULL
          AND public.can_manage_show(p_created_from_show_id)
        )
        OR (
          p_created_by IS NOT NULL
          AND p_created_by = (SELECT auth.uid())
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.roles r ON r.id = ur.role_id
            WHERE ur.auth_user_id = (SELECT auth.uid())
              AND ur.is_active = true
              AND (ur.expires_at IS NULL OR ur.expires_at > now())
              AND r.name IN ('secretary', 'club_admin', 'site_admin', 'platform_admin')
          )
        )
      )
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.dog_edit_allowed(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dog_edit_allowed(uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.dogs_guard_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_me uuid;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NOT public.dog_has_account_holder(OLD.owner_id, OLD.co_owner_id) THEN
    RETURN NEW;
  END IF;

  v_me := public.get_my_person_id();
  IF (v_me IS NOT NULL AND v_me IN (OLD.owner_id, OLD.co_owner_id))
     OR public.is_site_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only the dog''s owner can change who owns it.'
    USING ERRCODE = '42501';
END;
$function$;

COMMENT ON FUNCTION private.dogs_guard_owner_change() IS
  'MYK9-1158: refuses an API-role change to owner_id/co_owner_id of a dog whose owner or co-owner has an account, unless the caller is that owner/co-owner or a site admin.';

REVOKE ALL ON FUNCTION private.dogs_guard_owner_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_00_guard_owner_change ON public.dogs;
CREATE TRIGGER trg_00_guard_owner_change
  BEFORE UPDATE OF owner_id, co_owner_id ON public.dogs
  FOR EACH ROW
  WHEN (OLD.owner_id IS DISTINCT FROM NEW.owner_id
        OR OLD.co_owner_id IS DISTINCT FROM NEW.co_owner_id)
  EXECUTE FUNCTION private.dogs_guard_owner_change();

COMMIT;
