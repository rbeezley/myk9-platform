-- MYK9-1158 (security audit 2026-10-14, SA-2026-10-14-04; owner decision 2026-10-14):
-- only a dog's owner can hand it to someone else once an owner has a sign-in account.
--
-- 20261012224900 (MYK9-1127) lets a secretary edit a dog she brought in (created_by) or
-- one created from a show she manages (created_from_show_id), and a manager of a show the
-- dog is entered in may edit it too (can_manage_show_dog). Those arms stay: a secretary
-- must keep correcting the details of a mail-in dog she keyed, whether or not its owner
-- already has an account (cutting them off re-opened the MYK9-1127 incident; Codex
-- review on #2989). What none of them should allow is re-owning an account holder's dog:
-- nothing stopped a non-owner writing owner_id / co_owner_id.
--
-- 1. public.dog_has_account_holder(owner, co-owner): true when either person has a
--    sign-in account. SECURITY DEFINER so the answer never depends on the caller's
--    people_select (a caller who cannot see the owner must not read "no account").
--
-- 2. private.dogs_guard_owner_change(): an API-role UPDATE that changes owner_id or
--    co_owner_id of a dog whose CURRENT owner or co-owner has an account is refused
--    (42501) unless the caller is that owner or co-owner, or a site admin. A mail-in dog
--    (no account on either side) has nobody to protect, so the staff who may edit it
--    can still correct its owner, including handing it to an exhibitor who has an
--    account. SECURITY DEFINER RPCs and service-role writes run as their owner and pass,
--    as in the MYK9-1045 and MYK9-1159 guards.
--
-- 3. public.can_change_dog_owner(dog): the UI's question, mirroring can_edit_dog():
--    dog_edit_allowed() AND the trigger's rule, read under the caller's own dogs_select.
--    NULL (unanswered, not "no") for a dog the server does not have yet. The Edit Dog
--    owner picker asks it, so show staff are never offered an ownership change the
--    trigger refuses.
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
  'MYK9-1158: true when the dog''s owner or co-owner has a sign-in account; its ownership is then frozen against everyone but that owner/co-owner and site admins.';

REVOKE EXECUTE ON FUNCTION public.dog_has_account_holder(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dog_has_account_holder(uuid, uuid) TO authenticated, service_role;

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

-- SECURITY INVOKER on purpose, like can_edit_dog(): it reads the dog under the caller's
-- own dogs_select, and NULL (no row) means "not on the server yet", not "no".
CREATE OR REPLACE FUNCTION public.can_change_dog_owner(p_dog_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT
    public.dog_edit_allowed(d.id, d.owner_id, d.co_owner_id, d.created_by, d.created_from_show_id)
    AND (
      NOT public.dog_has_account_holder(d.owner_id, d.co_owner_id)
      OR (
        (SELECT public.get_my_person_id()) IS NOT NULL
        AND (SELECT public.get_my_person_id()) IN (d.owner_id, d.co_owner_id)
      )
      OR (SELECT public.is_site_admin())
    )
  FROM public.dogs d
  WHERE d.id = p_dog_id;
$function$;

COMMENT ON FUNCTION public.can_change_dog_owner(uuid) IS
  'MYK9-1158: may the caller change this dog''s owner/co-owner? dogs_update plus trg_00_guard_owner_change; NULL for a dog not on the server yet.';

REVOKE EXECUTE ON FUNCTION public.can_change_dog_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_change_dog_owner(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
