-- Prevent self-granting of is_early_adopter via the people_update_own RLS policy.
-- Without this trigger, any authenticated user could run:
--   UPDATE public.people SET is_early_adopter = true WHERE auth_user_id = auth.uid();
-- and grant themselves free premium access.
--
-- The BEFORE UPDATE OF is_early_adopter trigger fires only when that column is
-- in the UPDATE target list, keeping overhead zero for ordinary profile edits.

CREATE OR REPLACE FUNCTION public.people_protect_early_adopter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_early_adopter IS DISTINCT FROM OLD.is_early_adopter THEN
    IF NOT public.is_site_admin() THEN
      RAISE EXCEPTION 'Permission denied: is_early_adopter can only be changed by site admins'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER people_protect_early_adopter_trigger
  BEFORE UPDATE OF is_early_adopter ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_protect_early_adopter();
