-- MYK9-1016: one manager write for a judge/date, never a partial series of
-- assignment updates. The historical MAX merge rule stays in the reader.
BEGIN;

-- Keep the canonical reader safe over the writer's full integer domain.
-- Copied from 20261005031700; only percentage multiplication is widened.
CREATE OR REPLACE FUNCTION public.get_judge_day_capacity_live(
  p_judge_id uuid,
  p_show_id uuid,
  p_date date,
  p_exclude_auth_user_id uuid DEFAULT NULL,
  p_count_holds boolean DEFAULT true
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
DECLARE
  v_capacity integer;
  v_override integer;
  v_show_capacity integer;
  v_confirmed integer;
  v_waitlist integer;
  v_reserved integer;
  v_class_ids uuid[];
  v_mail_in_strategy text;
  v_mail_in_value integer;
  v_mail_in_auto_release boolean;
  v_mail_in_release_date date;
BEGIN
  SELECT COALESCE(ARRAY_AGG(DISTINCT ja.class_id), ARRAY[]::uuid[])
  INTO v_class_ids
  FROM public.judge_assignments ja
  JOIN public.classes c ON c.id = ja.class_id
  JOIN public.trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed';

  SELECT
    s.default_judge_day_capacity,
    s.mail_in_strategy,
    s.mail_in_value,
    s.mail_in_auto_release,
    s.mail_in_release_date
  INTO
    v_show_capacity,
    v_mail_in_strategy,
    v_mail_in_value,
    v_mail_in_auto_release,
    v_mail_in_release_date
  FROM public.shows s
  WHERE s.id = p_show_id;

  SELECT MAX(ja.day_capacity_override)
  INTO v_override
  FROM public.judge_assignments ja
  JOIN public.classes c ON c.id = ja.class_id
  JOIN public.trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed'
    AND ja.day_capacity_override IS NOT NULL;

  v_capacity := COALESCE(v_override, v_show_capacity, 125);

  v_reserved := 0;
  IF NOT (
    COALESCE(v_mail_in_auto_release, false)
    AND v_mail_in_release_date IS NOT NULL
    AND v_mail_in_release_date <= CURRENT_DATE
  ) THEN
    IF v_mail_in_strategy = 'fixed' THEN
      v_reserved := GREATEST(0, COALESCE(v_mail_in_value, 0));
    ELSIF v_mail_in_strategy = 'percentage' THEN
      v_reserved := GREATEST(0, FLOOR(v_capacity::numeric * COALESCE(v_mail_in_value, 0) / 100.0));
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO v_confirmed
  FROM public.entries e
  WHERE e.class_id = ANY(v_class_ids)
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment')
    AND e.deleted_at IS NULL;

  -- MYK9-1012: a spot a cart holds at Pay is taken until the hold ends.
  IF p_count_holds THEN
    v_confirmed := v_confirmed + public.held_spot_count(v_class_ids, p_exclude_auth_user_id);
  END IF;

  SELECT COUNT(*)
  INTO v_waitlist
  FROM public.waitlist_entries we
  WHERE we.class_id = ANY(v_class_ids)
    AND we.status = 'waiting';

  judge_id := p_judge_id;
  show_date := p_date;
  capacity := v_capacity;
  confirmed_count := v_confirmed;
  waitlist_count := v_waitlist;
  mail_in_reserved := v_reserved;
  available_spots := GREATEST(0, v_capacity - v_confirmed - v_reserved);
  class_ids := v_class_ids;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_judge_day_capacity_live(uuid, uuid, date, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_judge_day_capacity_live(uuid, uuid, date, uuid, boolean)
  TO service_role;


CREATE OR REPLACE FUNCTION public.set_judge_day_capacity(
  p_show_id uuid, p_judge_id uuid, p_date date, p_capacity integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shows s WHERE s.id = p_show_id
      AND s.deleted_at IS NULL
      AND (public.is_site_admin() OR public.can_manage_show(s.id))
  ) THEN
    RAISE EXCEPTION 'Only a show manager may change this entry limit.' USING ERRCODE = '42501';
  END IF;
  IF p_judge_id IS NULL OR p_date IS NULL OR (p_capacity IS NOT NULL AND p_capacity <= 0) THEN
    RAISE EXCEPTION 'Choose a judge-day and a positive whole-number limit, or clear the limit.' USING ERRCODE = '22023';
  END IF;
  -- Same order/key as evaluate_entry_capacity: serialize with entry decisions.
  PERFORM pg_advisory_xact_lock(hashtext('showcapacity:' || p_show_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('judgeday:' || p_judge_id::text || ':' || p_date::text));
  UPDATE public.judge_assignments ja
     SET day_capacity_override = p_capacity
    FROM public.classes c JOIN public.trials t ON t.id = c.trial_id
   WHERE ja.class_id = c.id AND ja.show_id = p_show_id
     AND t.show_id = p_show_id AND t.date = p_date
     AND ja.person_id = p_judge_id AND ja.status = 'confirmed';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No confirmed assignments were found for this judge-day.' USING ERRCODE = '22023';
  END IF;
  RETURN v_updated;
END;
$$;
COMMENT ON FUNCTION public.set_judge_day_capacity(uuid, uuid, date, integer) IS
  'MYK9-1016: online manager-only atomic judge-day capacity write. Updates only day_capacity_override on every confirmed class assignment for the actual show/date. NULL clears all overrides to the show default (125 fallback). No private fields are read or written.';
REVOKE ALL ON FUNCTION public.set_judge_day_capacity(uuid, uuid, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_judge_day_capacity(uuid, uuid, date, integer) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
