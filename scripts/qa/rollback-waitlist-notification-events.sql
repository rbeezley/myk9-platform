\set ON_ERROR_STOP on

BEGIN;
DROP TRIGGER IF EXISTS trg_waitlist_offer_notification ON public.waitlist_entries;
DROP FUNCTION IF EXISTS public.notify_waitlist_offer_event();
DROP FUNCTION IF EXISTS public.enqueue_due_waitlist_reminder_events(timestamptz, integer);
DROP FUNCTION IF EXISTS public.list_retryable_waitlist_notification_events(integer);
DROP FUNCTION IF EXISTS public.record_waitlist_push_delivery(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.renew_waitlist_notification_claim(uuid, uuid);
DROP FUNCTION IF EXISTS public.claim_waitlist_notification_event(uuid);
DROP FUNCTION IF EXISTS public.enqueue_waitlist_notification_event(uuid, text);
DROP TABLE IF EXISTS public.waitlist_notification_events;
COMMIT;
