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
