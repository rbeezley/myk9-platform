-- Migration 159: Propagate people.auth_user_id backfill into user_roles.auth_user_id
--
-- Migration 156 denormalized people.auth_user_id into user_roles.auth_user_id and
-- added a trigger that syncs on `INSERT OR UPDATE OF user_id ON public.user_roles`.
-- That covers role assignments, but NOT the signup backfill path: when a pre-assigned
-- secretary or club admin (people row created with auth_user_id = NULL) signs up and
-- their people.auth_user_id transitions to the real auth uid, no trigger fires on
-- user_roles, so existing rows keep auth_user_id = NULL and the new user is denied
-- access by is_trial_secretary() / is_club_admin() / is_site_admin().
--
-- Fix: add a complementary trigger on public.people that propagates auth_user_id
-- changes into all matching user_roles rows.

CREATE OR REPLACE FUNCTION public.propagate_people_auth_user_id_to_user_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    UPDATE public.user_roles
    SET auth_user_id = NEW.auth_user_id
    WHERE user_id = NEW.id
      AND auth_user_id IS DISTINCT FROM NEW.auth_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS propagate_people_auth_user_id_trigger ON public.people;
CREATE TRIGGER propagate_people_auth_user_id_trigger
  AFTER UPDATE OF auth_user_id ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_people_auth_user_id_to_user_roles();

-- Backfill any user_roles rows that were already out of sync (e.g., pre-assigned
-- secretaries who already signed up before this migration ran).
UPDATE public.user_roles ur
SET auth_user_id = p.auth_user_id
FROM public.people p
WHERE p.id = ur.user_id
  AND ur.auth_user_id IS DISTINCT FROM p.auth_user_id
  AND p.auth_user_id IS NOT NULL;
