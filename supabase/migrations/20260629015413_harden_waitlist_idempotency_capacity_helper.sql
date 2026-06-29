-- Forward deploy review fixes for PR #1013.
--
-- 1. Do not rely on edits to already-applied waitlist migration 20260622002405.
-- 2. Keep the display RPC and paid-entry gate on the same capacity formula by
--    delegating to the VOLATILE live helper created in 20260628202146.

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_active_class_dog_key
  ON public.waitlist_entries (class_id, dog_id)
  WHERE status IN ('waiting', 'offered');

CREATE OR REPLACE FUNCTION public.get_judge_day_capacity(
  p_judge_id uuid,
  p_show_id uuid,
  p_date date
)
RETURNS TABLE (
  judge_id uuid,
  show_date date,
  capacity integer,
  confirmed_count integer,
  waitlist_count integer,
  mail_in_reserved integer,
  available_spots integer,
  class_ids uuid[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.get_judge_day_capacity_live(p_judge_id, p_show_id, p_date);
END;
$$;

REVOKE ALL ON FUNCTION public.get_judge_day_capacity(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_judge_day_capacity(uuid, uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_to_waitlist(
  p_class_id uuid,
  p_exhibitor_id uuid,
  p_dog_id uuid,
  p_handler_id uuid DEFAULT NULL,
  p_joined_via text DEFAULT 'online'
)
RETURNS public.waitlist_entries
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  next_position integer;
  new_entry public.waitlist_entries;
  v_show_id uuid;
  v_is_manager boolean;
BEGIN
  IF p_joined_via NOT IN ('online', 'mail_in') THEN
    RAISE EXCEPTION 'Invalid waitlist join channel';
  END IF;

  SELECT t.show_id
  INTO v_show_id
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  v_is_manager := public.is_show_secretary(v_show_id) OR public.is_site_admin();

  IF p_joined_via = 'mail_in' AND NOT v_is_manager THEN
    RAISE EXCEPTION 'Only show secretaries may create mail-in waitlist rows';
  END IF;

  IF NOT v_is_manager
     AND NOT (
       EXISTS (
         SELECT 1
         FROM public.exhibitor_profiles ep
         WHERE ep.id = p_exhibitor_id
           AND ep.auth_user_id = (SELECT auth.uid())
       )
       AND EXISTS (
         SELECT 1
         FROM public.dogs d
         WHERE d.id = p_dog_id
           AND (
             d.owner_id = public.get_my_person_id()
             OR d.co_owner_id = public.get_my_person_id()
           )
       )
     ) THEN
    RAISE EXCEPTION 'Caller cannot waitlist this dog';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

  SELECT *
  INTO new_entry
  FROM public.waitlist_entries
  WHERE class_id = p_class_id
    AND dog_id = p_dog_id
    AND status IN ('waiting', 'offered')
  ORDER BY position NULLS LAST, created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN new_entry;
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1
  INTO next_position
  FROM public.waitlist_entries
  WHERE class_id = p_class_id
    AND status = 'waiting';

  INSERT INTO public.waitlist_entries (
    class_id,
    exhibitor_id,
    dog_id,
    handler_id,
    position,
    joined_via
  )
  VALUES (
    p_class_id,
    p_exhibitor_id,
    p_dog_id,
    p_handler_id,
    next_position,
    p_joined_via
  )
  RETURNING * INTO new_entry;

  RETURN new_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.add_to_waitlist(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_to_waitlist(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
