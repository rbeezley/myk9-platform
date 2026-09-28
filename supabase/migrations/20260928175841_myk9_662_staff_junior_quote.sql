-- Staff need only a yes/no junior-fee decision before taking money. DOB stays
-- in people_private; unknown/typed handlers never qualify for the fee.
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

CREATE FUNCTION public.staff_entries_junior_fee_decisions(p_show_id uuid, p_entries jsonb)
RETURNS boolean[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry jsonb;
  v_class_id uuid;
  v_dog_id uuid;
  v_handler_id uuid;
  v_trial_id uuid;
  v_club_id uuid;
  v_decisions boolean[] := ARRAY[]::boolean[];
BEGIN
  SELECT club_id INTO v_club_id FROM public.shows WHERE id = p_show_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Show not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_show_secretary(p_show_id)
          OR (v_club_id IS NOT NULL AND public.is_club_admin(v_club_id))
          OR public.is_site_admin()) THEN
    RAISE EXCEPTION 'Not authorized to quote show entries' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'Entries are required' USING ERRCODE = '22023';
  END IF;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_class_id := (v_entry->>'class_id')::uuid;
    v_dog_id := (v_entry->>'dog_id')::uuid;
    SELECT t.id INTO v_trial_id FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
      WHERE c.id = v_class_id AND t.show_id = p_show_id;
    IF v_trial_id IS NULL THEN
      RAISE EXCEPTION 'Class does not belong to show' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.dogs WHERE id = v_dog_id) THEN
      RAISE EXCEPTION 'Dog not found' USING ERRCODE = '22023';
    END IF;
    v_handler_id := nullif(v_entry->>'handler_id', '')::uuid;
    IF v_handler_id IS NOT NULL AND NOT private.entry_handler_has_show_relationship(
      p_show_id, v_dog_id, v_handler_id
    ) THEN
      RAISE EXCEPTION 'Handler has no relationship to this dog or show'
        USING ERRCODE = '42501';
    END IF;
    IF v_handler_id IS NULL AND nullif(btrim(v_entry->>'handler_name'), '') IS NULL THEN
      SELECT owner_id INTO v_handler_id FROM public.dogs WHERE id = v_dog_id;
    END IF;
    v_decisions := array_append(
      v_decisions,
      v_handler_id IS NOT NULL AND
      private.entry_handler_is_junior(v_handler_id, v_class_id, v_trial_id) IS TRUE
    );
  END LOOP;
  RETURN v_decisions;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_entries_junior_fee_decisions(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_entries_junior_fee_decisions(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.staff_entries_need_junior_fee(p_show_id uuid, p_entries jsonb)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT true = ANY(public.staff_entries_junior_fee_decisions(p_show_id, p_entries));
$$;
REVOKE ALL ON FUNCTION public.staff_entries_need_junior_fee(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_entries_need_junior_fee(uuid,jsonb) TO authenticated;

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
