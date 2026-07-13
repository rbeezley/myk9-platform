-- Durable, retryable email/push delivery for waitlist offer lifecycle events.
-- OpenSpec change: stripe-golive-enforcement (Phase C).

BEGIN;

CREATE TABLE public.waitlist_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waitlist_entry_id uuid NOT NULL
    REFERENCES public.waitlist_entries(id) ON DELETE CASCADE,
  offer_cycle_at timestamptz NOT NULL,
  event_type text NOT NULL
    CHECK (event_type IN ('offered', 'reminder', 'expired')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  processing_started_at timestamptz,
  claim_token uuid,
  last_attempt_at timestamptz,
  email_sent_at timestamptz,
  push_sent_at timestamptz,
  push_delivered_endpoint_hashes text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (waitlist_entry_id, offer_cycle_at, event_type)
);

CREATE INDEX waitlist_notification_events_retry_idx
  ON public.waitlist_notification_events (status, updated_at)
  WHERE status IN ('pending', 'failed', 'processing');

COMMENT ON TABLE public.waitlist_notification_events IS
  'One retryable email/push delivery event per waitlist offer cycle and lifecycle event type.';
COMMENT ON COLUMN public.waitlist_notification_events.last_error IS
  'Redacted delivery failure category; never stores provider response bodies, addresses, or secrets.';

ALTER TABLE public.waitlist_notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_notification_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.waitlist_notification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.waitlist_notification_events TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_waitlist_notification_event(
  p_waitlist_entry_id uuid,
  p_event_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offer_cycle_at timestamptz;
  v_event_id uuid;
BEGIN
  IF p_event_type NOT IN ('offered', 'reminder', 'expired') THEN
    RAISE EXCEPTION 'invalid waitlist notification event type: %', p_event_type
      USING ERRCODE = '22023';
  END IF;

  SELECT wl.offered_at
  INTO v_offer_cycle_at
  FROM public.waitlist_entries wl
  WHERE wl.id = p_waitlist_entry_id;

  IF v_offer_cycle_at IS NULL THEN
    RAISE EXCEPTION 'waitlist entry % has no offer cycle', p_waitlist_entry_id
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.waitlist_notification_events (
    waitlist_entry_id,
    offer_cycle_at,
    event_type
  ) VALUES (
    p_waitlist_entry_id,
    v_offer_cycle_at,
    p_event_type
  )
  ON CONFLICT (waitlist_entry_id, offer_cycle_at, event_type)
  DO UPDATE SET
    updated_at = waitlist_notification_events.updated_at
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_waitlist_notification_event(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_waitlist_notification_event(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_waitlist_notification_event(p_event_id uuid)
RETURNS TABLE (
  event_id uuid,
  waitlist_entry_id uuid,
  event_type text,
  offer_cycle_at timestamptz,
  claim_token uuid,
  email_sent_at timestamptz,
  push_sent_at timestamptz,
  push_delivered_endpoint_hashes text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.waitlist_notification_events AS event
  SET status = 'processing',
      attempt_count = event.attempt_count + 1,
      processing_started_at = now(),
      claim_token = gen_random_uuid(),
      last_attempt_at = now(),
      last_error = NULL,
      updated_at = now()
  WHERE event.id = p_event_id
    AND (
      event.status IN ('pending', 'failed')
      OR (
        event.status = 'processing'
        AND event.processing_started_at <= now() - interval '10 minutes'
      )
    )
  RETURNING event.id, event.waitlist_entry_id, event.event_type, event.offer_cycle_at,
            event.claim_token, event.email_sent_at, event.push_sent_at,
            event.push_delivered_endpoint_hashes;
$$;

REVOKE ALL ON FUNCTION public.claim_waitlist_notification_event(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_notification_event(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.renew_waitlist_notification_claim(
  p_event_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH renewed AS (
    UPDATE public.waitlist_notification_events AS event
    SET processing_started_at = now(),
        updated_at = now()
    WHERE event.id = p_event_id
      AND event.status = 'processing'
      AND event.claim_token = p_claim_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM renewed);
$$;

REVOKE ALL ON FUNCTION public.renew_waitlist_notification_claim(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_waitlist_notification_claim(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_waitlist_push_delivery(
  p_event_id uuid,
  p_claim_token uuid,
  p_endpoint_hash text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH recorded AS (
    UPDATE public.waitlist_notification_events AS event
    SET push_delivered_endpoint_hashes = CASE
          WHEN p_endpoint_hash = ANY(event.push_delivered_endpoint_hashes)
            THEN event.push_delivered_endpoint_hashes
          ELSE array_append(event.push_delivered_endpoint_hashes, p_endpoint_hash)
        END,
        processing_started_at = now(),
        updated_at = now()
    WHERE event.id = p_event_id
      AND event.status = 'processing'
      AND event.claim_token = p_claim_token
      AND nullif(p_endpoint_hash, '') IS NOT NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM recorded);
$$;

REVOKE ALL ON FUNCTION public.record_waitlist_push_delivery(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_waitlist_push_delivery(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.list_retryable_waitlist_notification_events(
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  event_id uuid,
  waitlist_entry_id uuid,
  event_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT event.id, event.waitlist_entry_id, event.event_type
  FROM public.waitlist_notification_events AS event
  WHERE event.attempt_count < 8
    AND (
      (event.status = 'pending' AND event.updated_at <= now() - interval '1 minute')
      OR (event.status = 'failed' AND event.updated_at <= now() - interval '5 minutes')
      OR (
        event.status = 'processing'
        AND event.processing_started_at <= now() - interval '10 minutes'
      )
    )
  ORDER BY event.updated_at, event.created_at
  LIMIT greatest(1, least(coalesce(p_limit, 50), 100));
$$;

REVOKE ALL ON FUNCTION public.list_retryable_waitlist_notification_events(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_retryable_waitlist_notification_events(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_due_waitlist_reminder_events(
  p_now timestamptz DEFAULT now(),
  p_limit integer DEFAULT 15
)
RETURNS TABLE (
  event_id uuid,
  waitlist_entry_id uuid,
  event_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH due AS (
    SELECT waitlist.id, waitlist.offered_at
    FROM public.waitlist_entries AS waitlist
    JOIN public.entries AS entry ON entry.id = waitlist.promoted_entry_id
    WHERE waitlist.status = 'offered'
      AND waitlist.joined_via IS DISTINCT FROM 'mail_in'
      AND waitlist.offered_at IS NOT NULL
      AND waitlist.offer_expires_at > p_now
      AND p_now >= waitlist.offered_at
        + ((waitlist.offer_expires_at - waitlist.offered_at) / 2)
      AND entry.entry_status = 'pending-payment'
      AND entry.payment_status IS DISTINCT FROM 'paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.waitlist_notification_events AS existing
        WHERE existing.waitlist_entry_id = waitlist.id
          AND existing.offer_cycle_at = waitlist.offered_at
          AND existing.event_type = 'reminder'
      )
    ORDER BY waitlist.offer_expires_at, waitlist.id
    LIMIT greatest(1, least(coalesce(p_limit, 15), 50))
    FOR UPDATE OF waitlist SKIP LOCKED
  ), inserted AS (
    INSERT INTO public.waitlist_notification_events (
      waitlist_entry_id,
      offer_cycle_at,
      event_type
    )
    SELECT due.id, due.offered_at, 'reminder'
    FROM due
    ON CONFLICT (waitlist_entry_id, offer_cycle_at, event_type) DO NOTHING
    RETURNING id, waitlist_entry_id, event_type
  )
  SELECT inserted.id, inserted.waitlist_entry_id, inserted.event_type
  FROM inserted;
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_waitlist_reminder_events(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_waitlist_reminder_events(timestamptz, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.notify_waitlist_offer_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  edge_function_base_url text;
  webhook_secret text;
  event_id uuid;
BEGIN
  event_id := public.enqueue_waitlist_notification_event(new.id, 'offered');

  BEGIN
    SELECT decrypted_secret
    INTO edge_function_base_url
    FROM vault.decrypted_secrets
    WHERE name = 'edge_function_base_url';

    SELECT decrypted_secret
    INTO webhook_secret
    FROM vault.decrypted_secrets
    WHERE name = 'push_webhook_secret';

    IF nullif(edge_function_base_url, '') IS NULL
      OR nullif(webhook_secret, '') IS NULL
    THEN
      RAISE NOTICE 'waitlist offer notification queued without dispatcher configuration';
      RETURN new;
    END IF;

    PERFORM net.http_post(
      url := edge_function_base_url || '/push-trigger-waitlist',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || webhook_secret
      ),
      body := jsonb_build_object(
        'event_id', event_id,
        'waitlist_entry_id', new.id,
        'event_type', 'offered'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'waitlist offer notification dispatch enqueue failed (SQLSTATE %)', SQLSTATE;
  END;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_waitlist_offer_event()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_waitlist_offer_notification ON public.waitlist_entries;
CREATE TRIGGER trg_waitlist_offer_notification
  AFTER UPDATE OF status, offered_at ON public.waitlist_entries
  FOR EACH ROW
  WHEN (
    new.status = 'offered'
    AND old.status IS DISTINCT FROM 'offered'
    AND new.joined_via IS DISTINCT FROM 'mail_in'
  )
  EXECUTE FUNCTION public.notify_waitlist_offer_event();

COMMIT;
