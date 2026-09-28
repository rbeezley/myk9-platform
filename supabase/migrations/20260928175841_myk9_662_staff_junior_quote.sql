-- Staff need only a yes/no junior-fee decision before taking money. DOB stays
-- in people_private; unknown/typed handlers never qualify for the fee.
CREATE FUNCTION public.staff_entries_need_junior_fee(p_show_id uuid, p_entries jsonb)
RETURNS boolean
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
    v_handler_id := nullif(v_entry->>'handler_id', '')::uuid;
    IF v_handler_id IS NULL AND nullif(btrim(v_entry->>'handler_name'), '') IS NULL THEN
      SELECT owner_id INTO v_handler_id FROM public.dogs WHERE id = v_dog_id;
    END IF;
    IF v_handler_id IS NOT NULL AND
       private.entry_handler_is_junior(v_handler_id, v_class_id, v_trial_id) IS TRUE THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_entries_need_junior_fee(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_entries_need_junior_fee(uuid,jsonb) TO authenticated;
