-- Link each offered waitlist row to the pending-payment entry created to claim
-- the spot. This lets cron expire the entry and any open Stripe link when the
-- offer deadline passes.
--
-- Required Vault secret names:
--   cron_secret
--
-- Seed/rotate with vault.create_secret(...) or vault.update_secret(...)
-- before expecting the cron job to succeed. The scheduled SQL resolves the
-- secret at execution time so the value never lands in migration history.

begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;
create extension if not exists supabase_vault with schema vault;

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
) AS $$
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
  SELECT ARRAY_AGG(ja.class_id)
  INTO v_class_ids
  FROM public.judge_assignments ja
  JOIN public.classes c ON c.id = ja.class_id
  JOIN public.trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed';

  v_class_ids := COALESCE(v_class_ids, ARRAY[]::uuid[]);

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
      v_reserved := GREATEST(0, FLOOR(v_capacity * COALESCE(v_mail_in_value, 0) / 100.0));
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO v_confirmed
  FROM public.entries e
  WHERE e.class_id = ANY(v_class_ids)
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment')
    AND e.deleted_at IS NULL;

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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.get_judge_day_capacity(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_judge_day_capacity(uuid, uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_class_availability(p_class_id uuid)
RETURNS TABLE (
  available_spots integer,
  is_available boolean,
  waitlist_position integer,
  entry_limit integer,
  confirmed_count integer
) AS $$
DECLARE
  v_class_limit integer;
  v_confirmed_count integer;
  v_waitlist_count integer;
BEGIN
  SELECT c.max_entries
  INTO v_class_limit
  FROM public.classes c
  WHERE c.id = p_class_id;

  v_class_limit := COALESCE(v_class_limit, 0);

  SELECT COUNT(*)
  INTO v_confirmed_count
  FROM public.entries e
  WHERE e.class_id = p_class_id
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment')
    AND e.deleted_at IS NULL;

  SELECT COUNT(*)
  INTO v_waitlist_count
  FROM public.waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.status = 'waiting';

  available_spots := GREATEST(0, v_class_limit - v_confirmed_count);
  is_available := v_class_limit = 0 OR available_spots > 0;
  waitlist_position := v_waitlist_count + 1;
  entry_limit := v_class_limit;
  confirmed_count := v_confirmed_count;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.check_class_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_class_availability(uuid) TO authenticated, service_role;

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS promoted_entry_id uuid REFERENCES public.entries(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_promoted_entry_id_key
  ON public.waitlist_entries (promoted_entry_id)
  WHERE promoted_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.promote_waitlist_entry_internal(
  p_waitlist_entry_id uuid,
  p_deadline_hours integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wl waitlist_entries%ROWTYPE;
  v_new_entry_id uuid;
  v_deadline_hours integer;
  v_class_limit integer;
  v_class_entry_count integer;
  v_show_id uuid;
  v_trial_id uuid;
  v_trial_date date;
  v_judge_id uuid;
  v_judge_capacity record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_waitlist_entry_id::text));

  SELECT *
  INTO v_wl
  FROM waitlist_entries
  WHERE id = p_waitlist_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Waitlist entry not found';
  END IF;

  IF v_wl.status != 'waiting' THEN
    RAISE EXCEPTION 'Waitlist entry is not available for promotion';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_wl.class_id::text));

  SELECT c.max_entries, c.trial_id, t.show_id, t.date
  INTO v_class_limit, v_trial_id, v_show_id, v_trial_date
  FROM classes c
  JOIN trials t ON t.id = c.trial_id
  WHERE c.id = v_wl.class_id
  LIMIT 1;

  IF v_show_id IS NULL OR v_trial_id IS NULL THEN
    RAISE EXCEPTION 'Class/show not found for waitlist entry';
  END IF;

  IF COALESCE(v_class_limit, 0) > 0 THEN
    SELECT COUNT(*)
    INTO v_class_entry_count
    FROM entries e
    WHERE e.class_id = v_wl.class_id
      AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment')
      AND e.deleted_at IS NULL;

    IF v_class_entry_count >= v_class_limit THEN
      RAISE EXCEPTION 'Class is full';
    END IF;
  END IF;

  FOR v_judge_id IN
    SELECT DISTINCT ja.person_id
    FROM judge_assignments ja
    WHERE ja.class_id = v_wl.class_id
      AND ja.status = 'confirmed'
      AND ja.person_id IS NOT NULL
    ORDER BY ja.person_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)
    );

    SELECT *
    INTO v_judge_capacity
    FROM public.get_judge_day_capacity(v_judge_id, v_show_id, v_trial_date)
    LIMIT 1;

    IF COALESCE(v_judge_capacity.available_spots, 0) <= 0 THEN
      RAISE EXCEPTION 'Judge-day capacity is full';
    END IF;
  END LOOP;

  SELECT GREATEST(
    1,
    COALESCE(p_deadline_hours, s.waitlist_payment_deadline_hours, 48)
  )
  INTO v_deadline_hours
  FROM classes c
  JOIN trials t ON t.id = c.trial_id
  JOIN shows s ON s.id = t.show_id
  WHERE c.id = v_wl.class_id;

  IF v_deadline_hours IS NULL THEN
    RAISE EXCEPTION 'Class/show not found for waitlist entry';
  END IF;

  INSERT INTO entries (dog_id, class_id, show_id, trial_id, entry_status, handler_id)
  VALUES (v_wl.dog_id, v_wl.class_id, v_show_id, v_trial_id, 'pending-payment', v_wl.handler_id)
  RETURNING id INTO v_new_entry_id;

  UPDATE waitlist_entries
  SET status = 'offered',
      promoted_entry_id = v_new_entry_id,
      offered_at = now(),
      offer_expires_at = now() + (v_deadline_hours || ' hours')::interval,
      updated_at = now()
  WHERE id = p_waitlist_entry_id;

  RETURN v_new_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_waitlist_entry_internal(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_entry_internal(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.promote_waitlist_entry(
  p_waitlist_entry_id uuid,
  p_deadline_hours integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
BEGIN
  SELECT t.show_id, s.club_id
  INTO v_show_id, v_club_id
  FROM waitlist_entries wl
  JOIN classes c ON c.id = wl.class_id
  JOIN trials t ON t.id = c.trial_id
  JOIN shows s ON s.id = t.show_id
  WHERE wl.id = p_waitlist_entry_id;

  IF NOT (
    public.is_show_secretary(v_show_id)
    OR public.is_club_admin(v_club_id)
    OR public.is_site_admin()
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN public.promote_waitlist_entry_internal(p_waitlist_entry_id, p_deadline_hours);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_waitlist_entry(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_entry(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.promote_waitlist_entry_from_cron(
  p_waitlist_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.promote_waitlist_entry_internal(p_waitlist_entry_id, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_waitlist_entry_from_cron(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_entry_from_cron(uuid) TO service_role;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'waitlist-offer-expiration';

select
  cron.schedule(
    'waitlist-offer-expiration',
    '*/15 * * * *',
    $$
    do $waitlist_offer_expiration_cron$
    declare
      function_secret text;
    begin
      select decrypted_secret
      into function_secret
      from vault.decrypted_secrets
      where name = 'cron_secret';

      if nullif(function_secret, '') is null then
        raise exception 'Missing Vault secret: cron_secret';
      end if;

      perform net.http_post(
        url     := 'https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/cron-waitlist-expiration',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || function_secret
        ),
        body    := '{}'::jsonb
      );
    end
    $waitlist_offer_expiration_cron$;
    $$
  );

commit;
