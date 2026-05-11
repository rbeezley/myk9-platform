-- Grant the creator club-admin access for clubs they create.
--
-- Fresh secretaries can create a host club from the show wizard, but the
-- inserted club did not give them any scoped role on that club. The next
-- show-create RPC then failed `is_club_admin(club_id)` /
-- `is_trial_secretary(club_id)` with:
--   not authorized to create shows for club <id>
--
-- Keep this as a DB invariant so every club creation path behaves the same.

BEGIN;

CREATE OR REPLACE FUNCTION public.grant_club_admin_to_club_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid;
  v_person_id uuid;
  v_role_id uuid;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_person_id
  FROM public.people
  WHERE auth_user_id = v_auth_user_id;

  IF v_person_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_role_id
  FROM public.roles
  WHERE name = 'club_admin';

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'role "club_admin" does not exist'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_person_id
      AND role_id = v_role_id
      AND club_id = NEW.id
      AND show_id IS NULL
  ) THEN
    INSERT INTO public.user_roles (
      user_id,
      role_id,
      club_id,
      show_id,
      is_active,
      granted_at,
      granted_by
    ) VALUES (
      v_person_id,
      v_role_id,
      NEW.id,
      NULL,
      true,
      NOW(),
      v_person_id
    );
  ELSE
    UPDATE public.user_roles
    SET is_active = true,
        granted_at = NOW(),
        granted_by = v_person_id
    WHERE user_id = v_person_id
      AND role_id = v_role_id
      AND club_id = NEW.id
      AND show_id IS NULL
      AND is_active = false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_club_admin_to_club_creator ON public.clubs;
CREATE TRIGGER trg_grant_club_admin_to_club_creator
  AFTER INSERT ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_club_admin_to_club_creator();

COMMENT ON FUNCTION public.grant_club_admin_to_club_creator() IS
  'After a signed-in user creates a club, grants that person an active club_admin user_roles row scoped to the new club.';

NOTIFY pgrst, 'reload schema';

COMMIT;
