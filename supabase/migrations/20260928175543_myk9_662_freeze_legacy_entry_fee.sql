-- MYK9-662: legacy pending entries with NULL fee need one trusted price before
-- a Finish Payment cart or payment link can be created. Never reprice a row
-- after its fee has been stored.
--
-- These rows predate the junior fee, so they price at the normal tier and never
-- derive junior status: a manager can reassign an entry's handler_id, so a fee
-- that varies with the handler's age would answer "is this person a junior on
-- the trial date?" (the MYK9-664 bisect oracle). Junior pricing happens only
-- where the handler is resolved and guarded, on submission.
CREATE FUNCTION public.freeze_pending_entry_fee(p_entry_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry public.entries%ROWTYPE;
  v_owner_id uuid;
  v_co_owner_id uuid;
  v_pre_fee numeric;
  v_day_fee numeric;
  v_class_fee numeric;
  v_trial_id uuid;
  v_club_id uuid;
  v_fee numeric;
BEGIN
  SELECT * INTO v_entry FROM public.entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_entry.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Entry not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT d.owner_id, d.co_owner_id INTO v_owner_id, v_co_owner_id
    FROM public.dogs d WHERE d.id = v_entry.dog_id;
  SELECT s.pre_entry_fee, s.day_of_show_fee, c.entry_fee, t.id, s.club_id
    INTO v_pre_fee, v_day_fee, v_class_fee, v_trial_id, v_club_id
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    JOIN public.shows s ON s.id = t.show_id
   WHERE c.id = v_entry.class_id AND s.id = v_entry.show_id;
  IF v_trial_id IS NULL THEN
    RAISE EXCEPTION 'Entry class does not belong to its show' USING ERRCODE = '22023';
  END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND (public.get_my_person_id() IS NULL OR (
       public.get_my_person_id() IS DISTINCT FROM v_owner_id
       AND public.get_my_person_id() IS DISTINCT FROM v_co_owner_id
     ))
     AND NOT public.is_show_secretary(v_entry.show_id)
     AND NOT (v_club_id IS NOT NULL AND public.is_club_admin(v_club_id))
     AND NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Not authorized to price this entry' USING ERRCODE = '42501';
  END IF;
  IF v_entry.entry_fee IS NOT NULL THEN RETURN v_entry.entry_fee; END IF;
  IF v_entry.payment_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Only unpaid entries can have a missing fee frozen' USING ERRCODE = '22023';
  END IF;
  v_fee := COALESCE(
    CASE WHEN v_entry.is_day_of_show IS TRUE AND v_day_fee > 0 THEN v_day_fee
         ELSE v_pre_fee END,
    v_class_fee,
    0
  );
  UPDATE public.entries SET entry_fee = v_fee WHERE id = p_entry_id AND entry_fee IS NULL;
  RETURN v_fee;
END;
$$;
REVOKE ALL ON FUNCTION public.freeze_pending_entry_fee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.freeze_pending_entry_fee(uuid) TO authenticated, service_role;
