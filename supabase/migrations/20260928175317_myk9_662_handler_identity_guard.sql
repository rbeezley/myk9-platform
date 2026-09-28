-- MYK9-662: unverified co-owner IDs can grant both access and a junior fee.
-- The product has no co-owner acceptance flow yet. Only staff/service writes may
-- attach another person; ordinary owner updates keep existing relationships.
CREATE FUNCTION private.guard_dog_co_owner_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.co_owner_id IS NOT DISTINCT FROM OLD.co_owner_id)
     OR NEW.co_owner_id IS NULL
     OR NEW.co_owner_id = public.get_my_person_id()
     OR (SELECT auth.role()) = 'service_role'
     OR (session_user IN ('postgres', 'supabase_admin')
         AND current_setting('role', true) IN ('none', 'postgres', 'supabase_admin'))
     OR public.is_show_secretary()
     OR public.is_club_admin()
     OR public.is_site_admin() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A co-owner must be verified by show staff before assignment'
    USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_dog_co_owner_assignment ON public.dogs;
CREATE TRIGGER trg_guard_dog_co_owner_assignment
  BEFORE INSERT OR UPDATE OF co_owner_id ON public.dogs
  FOR EACH ROW EXECUTE FUNCTION private.guard_dog_co_owner_assignment();

-- A typed handler with no person match has unknown age, not the owner's age.
-- Keep handler_id NULL when there is a name but no explicit person ID.
DO $migration$
DECLARE
  definition text;
  old_clause constant text := 'IF v_handler_person_id IS NULL THEN';
  new_clause constant text := 'IF v_handler_person_id IS NULL AND (NOT v_is_official OR nullif(btrim(v_handler_name), '''') IS NULL) THEN';
BEGIN
  SELECT pg_get_functiondef('public.submit_show_entries(uuid,uuid,jsonb,uuid,text,jsonb)'::regprocedure)
    INTO definition;
  IF definition IS NULL OR
     (length(definition) - length(replace(definition, old_clause, ''))) / length(old_clause) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: typed-handler fallback anchor changed';
  END IF;
  EXECUTE replace(definition, old_clause, new_clause);
END;
$migration$;
