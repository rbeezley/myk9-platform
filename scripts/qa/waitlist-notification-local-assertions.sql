\set ON_ERROR_STOP on

DO $$
DECLARE
  waitlist_id constant uuid := '00000000-0000-4000-8000-000000000001';
  offered_event_id uuid;
  reminder_event_id uuid;
  duplicate_reminder_id uuid;
  reminder_claim_token uuid;
  claimed record;
  retryable record;
  first_reminder_batch integer;
  second_reminder_batch integer;
BEGIN
  INSERT INTO public.waitlist_entries(id, status, joined_via)
  VALUES (waitlist_id, 'waiting', 'online');

  UPDATE public.waitlist_entries
  SET status = 'offered',
      offered_at = '2026-07-13T01:00:00Z',
      offer_expires_at = '2026-07-15T01:00:00Z'
  WHERE id = waitlist_id;

  SELECT id INTO offered_event_id
  FROM public.waitlist_notification_events
  WHERE waitlist_entry_id = waitlist_id AND event_type = 'offered';
  IF offered_event_id IS NULL THEN RAISE EXCEPTION 'offered trigger did not enqueue event'; END IF;
  IF (SELECT count(*) FROM net.captured_requests) <> 1 THEN
    RAISE EXCEPTION 'offered trigger did not invoke dispatcher exactly once';
  END IF;

  UPDATE public.waitlist_entries SET offer_expires_at = '2026-07-16T01:00:00Z'
  WHERE id = waitlist_id;
  IF (SELECT count(*) FROM public.waitlist_notification_events) <> 1 THEN
    RAISE EXCEPTION 'ordinary offered-row update duplicated event';
  END IF;

  reminder_event_id := public.enqueue_waitlist_notification_event(waitlist_id, 'reminder');
  duplicate_reminder_id := public.enqueue_waitlist_notification_event(waitlist_id, 'reminder');
  IF reminder_event_id IS DISTINCT FROM duplicate_reminder_id THEN
    RAISE EXCEPTION 'reminder enqueue was not idempotent';
  END IF;

  SELECT * INTO claimed FROM public.claim_waitlist_notification_event(reminder_event_id);
  IF claimed.event_id IS NULL THEN RAISE EXCEPTION 'pending reminder was not claimable'; END IF;
  reminder_claim_token := claimed.claim_token;
  IF NOT public.renew_waitlist_notification_claim(reminder_event_id, reminder_claim_token) THEN
    RAISE EXCEPTION 'current claim could not renew lease';
  END IF;
  IF public.renew_waitlist_notification_claim(reminder_event_id, gen_random_uuid()) THEN
    RAISE EXCEPTION 'wrong claim token renewed lease';
  END IF;
  IF NOT public.record_waitlist_push_delivery(
    reminder_event_id,
    reminder_claim_token,
    'endpoint-sha256'
  ) THEN
    RAISE EXCEPTION 'current claim could not record push delivery';
  END IF;
  SELECT * INTO claimed FROM public.claim_waitlist_notification_event(reminder_event_id);
  IF claimed.event_id IS NOT NULL THEN RAISE EXCEPTION 'active processing event was double-claimed'; END IF;

  UPDATE public.waitlist_notification_events
  SET status = 'failed', claim_token = NULL, processing_started_at = NULL,
      last_error = 'push_http_503',
      updated_at = now() - interval '6 minutes'
  WHERE id = reminder_event_id;
  duplicate_reminder_id := public.enqueue_waitlist_notification_event(waitlist_id, 'reminder');
  IF NOT EXISTS (
    SELECT 1 FROM public.waitlist_notification_events
    WHERE id = duplicate_reminder_id
      AND status = 'failed'
      AND last_error = 'push_http_503'
  ) THEN
    RAISE EXCEPTION 'duplicate enqueue erased failed state';
  END IF;
  SELECT * INTO retryable
  FROM public.list_retryable_waitlist_notification_events(50)
  WHERE event_id = reminder_event_id;
  IF retryable.event_id IS NULL THEN RAISE EXCEPTION 'failed event was not retryable'; END IF;

  CREATE TEMP TABLE due_reminder_fixture AS
  SELECT gen_random_uuid() AS waitlist_id, gen_random_uuid() AS entry_id
  FROM generate_series(1, 16);
  INSERT INTO public.entries(id, entry_status, payment_status)
  SELECT entry_id, 'pending-payment', 'pending' FROM due_reminder_fixture;
  INSERT INTO public.waitlist_entries(
    id, status, joined_via, offered_at, offer_expires_at, promoted_entry_id
  )
  SELECT due.waitlist_id, 'offered', 'online',
         '2026-07-13T01:00:00Z', '2026-07-15T01:00:00Z', due.entry_id
  FROM due_reminder_fixture AS due;

  SELECT count(*) INTO first_reminder_batch
  FROM public.enqueue_due_waitlist_reminder_events('2026-07-14T01:00:00Z', 15);
  SELECT count(*) INTO second_reminder_batch
  FROM public.enqueue_due_waitlist_reminder_events('2026-07-14T01:00:00Z', 15);
  IF first_reminder_batch <> 15 OR second_reminder_batch <> 1 THEN
    RAISE EXCEPTION 'reminder batching starved later rows: first %, second %',
      first_reminder_batch, second_reminder_batch;
  END IF;

  IF has_function_privilege('authenticated', 'public.enqueue_waitlist_notification_event(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can enqueue notification events';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_waitlist_notification_event(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can claim notification events';
  END IF;
  IF has_function_privilege('authenticated', 'public.renew_waitlist_notification_claim(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can renew notification claims';
  END IF;
  IF has_function_privilege('authenticated', 'public.record_waitlist_push_delivery(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can record push delivery';
  END IF;
  IF has_function_privilege('authenticated', 'public.enqueue_due_waitlist_reminder_events(timestamptz,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can enqueue reminder batches';
  END IF;
END;
$$;
