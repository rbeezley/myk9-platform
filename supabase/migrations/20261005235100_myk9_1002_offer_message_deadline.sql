-- MYK9-1002 (last criterion): the in-app wait list offer message states the
-- deadline in the app's words, and a mail-in offer states none.
--
-- 1. An online offer's line reads the way the secretary's Offer dialog reads
--    ("They have 48 hours to pay (until Wed, Jul 15, 2:00 PM EDT)."), in the
--    exhibitor's voice:
--      "You have 48 hours to pay (until Wed, Jul 15, 2:00 PM EDT)."
--    Hours are the offer's own window (offer_expires_at - offered_at, as
--    promote_waitlist_entry_internal set them); the deadline is
--    offer_expires_at in the offered class's trial zone, validated against
--    pg_timezone_names, America/New_York otherwise (the app's getTrialTimezone
--    fallback, #2751 / MYK9-1013). The two fallbacks are unchanged: no
--    offered_at reads "Claim it by paying before <deadline>.", no deadline
--    reads "Claim it by paying before the offer ends."
--
-- 2. A mail-in offer (waitlist_entries.joined_via = 'mail_in') never expires:
--    the expiry job keeps it open until the secretary records the payment or
--    withdraws it (withdraw_waitlist_offer_internal, 20261005152300, and
--    withdrawWaitlistOffer.ts treat it the same way). Its message therefore
--    states no deadline and no "before it expires", even though
--    promote_waitlist_entry_internal still stamps offer_expires_at on it:
--      "A spot opened for <dog> in <class>. The club is holding it for you
--       until they receive your payment. Pay the club directly and soon —
--       they can release the spot if they don't hear from you. You pay for
--       this spot only if you claim it."  (owner-approved copy, 2026-10-05)
--    The secretary's Offer flow sends no payment link for a mail-in row; if a
--    link is ever passed, it is still appended.
--
-- Copied from 20261005152300_myk9_1001_waitlist_offer_withdrawn.sql (the
-- latest definition; identical to live pg_get_functiondef, 2026-10-05). Only
-- the joined_via lookup and the two copy branches change; signature,
-- SECURITY DEFINER, search_path, return values, the thread/message writes and
-- the grants are unchanged. Callers (send_waitlist_offer_message,
-- notify_waitlist_auto_offer) are untouched: both run after
-- promote_waitlist_entry_internal has set offered_at/offer_expires_at.
--
-- Behavioral coverage (CI only):
--   supabase/tests/myk9_1002_waitlist_offer_message_deadline_test.sql
--   supabase/tests/myk9_1001_waitlist_offer_withdrawn_test.sql (M1)
--   supabase/tests/myk9_1003_waitlist_auto_offer_test.sql (N2, M1, W1-W3)

BEGIN;

CREATE OR REPLACE FUNCTION public.send_waitlist_offer_message_internal(
  p_waitlist_entry_id uuid,
  p_sender_auth_user_id uuid,
  p_payment_link_url text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_participant uuid;
  v_class_name text;
  v_dog_name text;
  v_offered_at timestamptz;
  v_offer_expires_at timestamptz;
  v_mail_in boolean;
  v_trial_tz text;
  v_session_tz text;
  v_deadline text;
  v_hours integer;
  v_deadline_line text;
  v_thread_id uuid;
  v_body text;
BEGIN
  SELECT t.show_id,
         ep.auth_user_id,
         nullif(btrim(c.name), ''),
         coalesce(nullif(btrim(d.call_name), ''), nullif(btrim(d.name), '')),
         w.offered_at,
         w.offer_expires_at,
         w.joined_via = 'mail_in',
         t.timezone
  INTO v_show_id, v_participant, v_class_name, v_dog_name, v_offered_at, v_offer_expires_at,
       v_mail_in, v_trial_tz
  FROM public.waitlist_entries w
  JOIN public.classes c ON c.id = w.class_id
  JOIN public.trials t ON t.id = c.trial_id
  LEFT JOIN public.exhibitor_profiles ep ON ep.id = w.exhibitor_id
  LEFT JOIN public.dogs d ON d.id = w.dog_id
  WHERE w.id = p_waitlist_entry_id
    AND w.status = 'offered';

  IF NOT FOUND THEN
    RETURN 'not_offered';
  END IF;
  IF v_participant IS NULL THEN
    RETURN 'no_account';
  END IF;
  IF p_sender_auth_user_id IS NULL THEN
    RETURN 'no_sender';
  END IF;

  -- (show_id, participant_id) is the thread's unique key and the lookup below
  -- uses both, so DO NOTHING can only meet this exhibitor's own thread.
  INSERT INTO public.show_message_threads (show_id, participant_id)
  VALUES (v_show_id, v_participant)
  ON CONFLICT (show_id, participant_id) DO NOTHING;

  SELECT smt.id
  INTO v_thread_id
  FROM public.show_message_threads smt
  WHERE smt.show_id = v_show_id
    AND smt.participant_id = v_participant;

  IF coalesce(v_mail_in, false) THEN
    -- MYK9-1002: a mail-in offer never expires, so it states no deadline.
    v_deadline_line := 'The club is holding it for you until they receive your payment. '
      || 'Pay the club directly and soon — they can release the spot if they don''t hear from you.';
  ELSE
    -- The offered class's own trial's zone, validated; New York otherwise.
    v_trial_tz := COALESCE(
      (SELECT n.name FROM pg_catalog.pg_timezone_names n WHERE n.name = v_trial_tz),
      'America/New_York'
    );
    -- Render in that zone WITH its abbreviation ("EDT"). to_char's TZ reads
    -- the session zone, so switch it for this one call and put it back.
    v_session_tz := current_setting('TimeZone');
    PERFORM set_config('TimeZone', v_trial_tz, true);
    v_deadline := to_char(v_offer_expires_at, 'Dy, Mon FMDD, FMHH12:MI AM TZ');
    PERFORM set_config('TimeZone', v_session_tz, true);

    -- The offer's own window, in whole hours.
    IF v_offered_at IS NOT NULL AND v_offer_expires_at IS NOT NULL THEN
      v_hours := round(extract(epoch FROM (v_offer_expires_at - v_offered_at)) / 3600)::integer;
    END IF;

    -- The Offer dialog's words: "They have 48 hours to pay (until ...)".
    v_deadline_line := CASE
      WHEN v_deadline IS NULL
        THEN 'Claim it by paying before the offer ends.'
      WHEN v_hours IS NOT NULL AND v_hours >= 1
        THEN 'You have ' || v_hours || CASE WHEN v_hours = 1 THEN ' hour' ELSE ' hours' END
          || ' to pay (until ' || v_deadline || ').'
      ELSE 'Claim it by paying before ' || v_deadline || '.'
    END;
  END IF;

  v_body := 'A spot opened'
    || coalesce(' for ' || v_dog_name, '')
    || coalesce(' in ' || v_class_name, '')
    || '. '
    || v_deadline_line
    || ' You pay for this spot only if you claim it.'
    || CASE
         WHEN nullif(btrim(p_payment_link_url), '') IS NOT NULL
           THEN ' Complete payment to claim it: ' || btrim(p_payment_link_url)
         WHEN coalesce(v_mail_in, false)
           THEN ''
         ELSE ' Open My Entries to accept the offer before it expires.'
       END;

  INSERT INTO public.show_messages (show_id, thread_id, sender_id, body)
  VALUES (v_show_id, v_thread_id, p_sender_auth_user_id, v_body);

  RETURN 'sent';
END;
$$;

REVOKE ALL ON FUNCTION public.send_waitlist_offer_message_internal(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_waitlist_offer_message_internal(uuid, uuid, text)
  TO service_role;

COMMIT;
