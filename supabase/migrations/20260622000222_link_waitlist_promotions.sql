-- Link each offered waitlist row to the pending-payment entry created to claim
-- the spot. This lets cron expire the entry and any open Stripe link when the
-- offer deadline passes.
--
-- Shared-system note: before pushing this migration, replace
-- REPLACE_WITH_CRON_SECRET with the actual CRON_SECRET value configured for the
-- cron-waitlist-expiration edge function.

begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

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
  SELECT v_wl.dog_id, v_wl.class_id, t.show_id, c.trial_id, 'pending-payment', v_wl.handler_id
  FROM classes c
  JOIN trials t ON t.id = c.trial_id
  WHERE c.id = v_wl.class_id
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
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name IN ('secretary', 'club_admin', 'site_admin')
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
    select net.http_post(
      url     := 'https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/cron-waitlist-expiration',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer REPLACE_WITH_CRON_SECRET'
      ),
      body    := '{}'::jsonb
    );
    $$
  );

commit;
