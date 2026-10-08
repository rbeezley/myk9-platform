-- MYK9-1021: a mail-in dog at the front of an auto-offer line needs a
-- secretary action. The cron asks this service-only RPC once per candidate;
-- the row/class/judge-day recheck and per-recipient marker make it safe to
-- call again every fifteen minutes or from concurrent cron runs.

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'entry_confirmed', 'q_earned', 'schedule_change', 'judge_assignment',
  'club_access_approved', 'waitlist_auto_offer', 'waitlist_mail_in_head'
));

CREATE TABLE private.waitlist_mail_in_head_notices (
  waitlist_entry_id uuid NOT NULL REFERENCES public.waitlist_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (waitlist_entry_id, user_id)
);
ALTER TABLE private.waitlist_mail_in_head_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.waitlist_mail_in_head_notices FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.waitlist_mail_in_head_notices IS
  'MYK9-1021: one manual-offer-needed notice per mail-in waitlist head and secretary. A newly assigned secretary may receive their own notice; a later cron run cannot repeat one.';

CREATE OR REPLACE FUNCTION public.notify_mail_in_waitlist_head(p_waitlist_entry_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wl public.waitlist_entries%ROWTYPE;
  v_show_id uuid;
  v_club_id uuid;
  v_trial_date date;
  v_class_limit integer;
  v_class_count integer;
  v_class_name text;
  v_dog_name text;
  v_judge_id uuid;
  v_available integer;
  v_recipient record;
  v_sent integer := 0;
  v_marker uuid;
BEGIN
  -- The same lock order as waitlist promotion: row, class, judge/day.
  PERFORM pg_advisory_xact_lock(hashtext(p_waitlist_entry_id::text));
  SELECT * INTO v_wl FROM public.waitlist_entries
  WHERE id = p_waitlist_entry_id FOR UPDATE;
  IF NOT FOUND OR v_wl.status IS DISTINCT FROM 'waiting'
     OR v_wl.joined_via IS DISTINCT FROM 'mail_in' THEN
    RETURN 'not_eligible';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_wl.class_id::text));
  SELECT t.show_id, s.club_id, t.date, c.max_entries,
         coalesce(nullif(btrim(c.name), ''), 'a class'),
         coalesce(nullif(btrim(d.call_name), ''), nullif(btrim(d.name), ''), 'The next dog')
  INTO v_show_id, v_club_id, v_trial_date, v_class_limit, v_class_name, v_dog_name
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  JOIN public.shows s ON s.id = t.show_id
  LEFT JOIN public.dogs d ON d.id = v_wl.dog_id
  WHERE c.id = v_wl.class_id
    AND c.deleted_at IS NULL AND t.deleted_at IS NULL AND s.deleted_at IS NULL
    AND s.waitlist_auto_offer;

  IF NOT FOUND OR public.waitlist_class_trial_has_passed(v_wl.class_id) THEN
    RETURN 'not_eligible';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.waitlist_entries o
    WHERE o.class_id = v_wl.class_id AND o.status = 'offered'
  ) OR EXISTS (
    SELECT 1 FROM public.waitlist_entries earlier
    WHERE earlier.class_id = v_wl.class_id AND earlier.status = 'waiting'
      AND (earlier.position, earlier.id) < (v_wl.position, v_wl.id)
  ) THEN
    RETURN 'not_eligible';
  END IF;

  IF coalesce(v_class_limit, 0) > 0 THEN
    SELECT count(*) INTO v_class_count FROM public.entries e
    WHERE e.class_id = v_wl.class_id
      AND e.entry_status IN (
        'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment'
      )
      AND e.deleted_at IS NULL;
    v_class_count := v_class_count + public.held_spot_count(ARRAY[v_wl.class_id]);
    IF v_class_count >= v_class_limit THEN RETURN 'no_spot'; END IF;
  END IF;

  FOR v_judge_id IN
    SELECT DISTINCT ja.person_id FROM public.judge_assignments ja
    WHERE ja.class_id = v_wl.class_id AND ja.status = 'confirmed'
      AND ja.person_id IS NOT NULL ORDER BY ja.person_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)
    );
    SELECT available_spots INTO v_available
    FROM public.get_judge_day_capacity(v_judge_id, v_show_id, v_trial_date) LIMIT 1;
    IF coalesce(v_available, 0) <= 0 THEN RETURN 'no_spot'; END IF;
  END LOOP;

  FOR v_recipient IN
    WITH staff AS (
      SELECT ur.auth_user_id, r.name AS role_name, min(ur.granted_at) AS granted_at
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE r.name IN ('secretary', 'club_admin')
        AND ur.club_id = v_club_id AND ur.show_id IS NULL AND ur.is_active
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
        AND ur.auth_user_id IS NOT NULL
      GROUP BY ur.auth_user_id, r.name
    )
    SELECT staff.auth_user_id, min(staff.granted_at) AS granted_at FROM staff
    WHERE staff.role_name = 'secretary'
       OR NOT EXISTS (SELECT 1 FROM staff s2 WHERE s2.role_name = 'secretary')
    GROUP BY staff.auth_user_id
    ORDER BY min(staff.granted_at) NULLS LAST, staff.auth_user_id
  LOOP
    INSERT INTO private.waitlist_mail_in_head_notices (waitlist_entry_id, user_id)
    VALUES (p_waitlist_entry_id, v_recipient.auth_user_id)
    ON CONFLICT DO NOTHING RETURNING user_id INTO v_marker;
    IF v_marker IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, type, message, deep_link_url)
    VALUES (
      v_recipient.auth_user_id,
      'waitlist_mail_in_head',
      format('A spot opened in %s. %s is next and joined by mail; offer it from the Waitlist tab.',
             v_class_name, v_dog_name),
      '/shows/' || v_show_id || '/entries?tab=waitlist'
    );
    v_sent := v_sent + 1;
    v_marker := NULL;
  END LOOP;

  IF v_sent > 0 THEN RETURN 'sent'; END IF;
  RETURN 'already_sent_or_no_recipient';
END;
$$;

REVOKE ALL ON FUNCTION public.notify_mail_in_waitlist_head(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_mail_in_waitlist_head(uuid) TO service_role;

COMMIT;
