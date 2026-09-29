-- MYK9-662: no read-only staff quote is exposed; first-time entries are priced by submit_show_entries.
CREATE FUNCTION private.entry_handler_has_show_relationship(
  p_show_id uuid, p_dog_id uuid, p_handler_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dogs d
    WHERE d.id = p_dog_id
      AND p_handler_id IN (d.owner_id, d.co_owner_id)
  ) OR EXISTS (
    SELECT 1 FROM public.entries e
    WHERE e.show_id = p_show_id AND e.dog_id = p_dog_id
      AND e.handler_id = p_handler_id AND e.deleted_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.enrollments en
    WHERE en.show_id = p_show_id AND en.handler_id = p_handler_id
  );
$$;
REVOKE ALL ON FUNCTION private.entry_handler_has_show_relationship(uuid,uuid,uuid) FROM PUBLIC;

-- The staff submission RPC also returns a fee, so it must enforce the same
-- handler scope before that amount can reveal the private junior decision.
DO $migration$
DECLARE
  definition text;
  anchor constant text := '    IF v_handler_person_id IS NOT NULL AND NOT EXISTS (';
  guard_clause constant text := $body$
    IF v_is_official AND v_handler_person_id IS NOT NULL
       AND NOT private.entry_handler_has_show_relationship(
         p_show_id, v_dog_id, v_handler_person_id
       ) THEN
      RAISE EXCEPTION 'Handler has no relationship to this dog or show'
        USING ERRCODE = '42501';
    END IF;

$body$;
BEGIN
  SELECT pg_get_functiondef('public.submit_show_entries(uuid,uuid,jsonb,uuid,text,jsonb)'::regprocedure)
    INTO definition;
  IF definition IS NULL OR
     (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 THEN
    RAISE EXCEPTION 'MYK9-662: staff handler scope anchor changed';
  END IF;
  EXECUTE replace(definition, anchor, guard_clause || anchor);
END;
$migration$;
