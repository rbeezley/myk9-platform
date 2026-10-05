-- MYK9-1001 + MYK9-1002 (secretary part): a secretary can withdraw an open
-- wait list offer, and the offer message states the window in hours and the
-- deadline with its time zone.
--
-- 1. waitlist_entries.status admits 'withdrawn': the show's secretary took the
--    offer back (withdraw-waitlist-offer edge function, the same
--    expireWaitlistOffer path an expiry or an exhibitor's decline uses: the
--    Stripe page is expired first, then the pending-payment entry becomes
--    promotion-expired, then the row takes this status). It is a terminal
--    status like 'declined', with its own word so the exhibitor's My Shows
--    card can say the club withdrew the offer instead of "You declined".
--    Every reader that lists live statuses names them ('waiting', 'offered'),
--    so a withdrawn row frees the dog to rejoin and counts nowhere; the
--    webhook's paid-offer resolution matches ('offered', 'expired') only, so a
--    withdrawn row is treated exactly like a declined one.
--
--    Live constraint (pg_constraint, 2026-10-05):
--      waitlist_entries_status_check
--      CHECK (status = ANY (ARRAY['waiting','offered','accepted','declined','expired']))
--
-- 2. send_waitlist_offer_message_internal: the deadline line becomes
--      "You have 48 hours to claim it by paying (until Wed, Jul 15, 2:00 PM EDT)."
--    The hours are the offer's own window (offer_expires_at - offered_at, as
--    promote_waitlist_entry_internal set it from shows.waitlist_payment_
--    deadline_hours, default 48, minimum 1). The deadline gains the weekday
--    and the zone abbreviation, the same shape as the exhibitor's My Shows card
--    ("Claim by Wed, Jul 15, 2:00 PM EDT", #2765) and the secretary's offer
--    dialog. The zone is still the offered class's own trial zone with the
--    America/New_York fallback (MYK9-1013). When offered_at is missing the line
--    reads "Claim it by paying before <deadline>."; with no deadline at all it
--    still reads "before the offer ends".
--
--    Copied from 20261004233700_myk9_1013_waitlist_offer_message_copy.sql (the
--    latest definition). Only the deadline line and the lookups it needs
--    change; signature, SECURITY DEFINER, search_path, return values, the
--    thread/message writes and the grants are unchanged.
--
-- Behavioral coverage (CI only):
--   supabase/tests/myk9_1001_waitlist_offer_withdrawn_test.sql
--   supabase/tests/myk9_1003_waitlist_auto_offer_test.sql (M1, W1-W3 copy)
--
-- Deploy order: this migration, then withdraw-waitlist-offer, then the
-- frontend. Nothing deployed today writes 'withdrawn'.

BEGIN;

ALTER TABLE public.waitlist_entries
  DROP CONSTRAINT waitlist_entries_status_check;

ALTER TABLE public.waitlist_entries
  ADD CONSTRAINT waitlist_entries_status_check
  CHECK (status IN ('waiting', 'offered', 'accepted', 'declined', 'expired', 'withdrawn'));

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
         t.timezone
  INTO v_show_id, v_participant, v_class_name, v_dog_name, v_offered_at, v_offer_expires_at,
       v_trial_tz
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

  -- The offered class's own trial's zone, validated; New York otherwise.
  v_trial_tz := COALESCE(
    (SELECT n.name FROM pg_catalog.pg_timezone_names n WHERE n.name = v_trial_tz),
    'America/New_York'
  );
  -- MYK9-1002: render in that zone WITH its abbreviation ("EDT"). to_char's TZ
  -- reads the session zone, so switch it for this one call and put it back.
  v_session_tz := current_setting('TimeZone');
  PERFORM set_config('TimeZone', v_trial_tz, true);
  v_deadline := to_char(v_offer_expires_at, 'Dy, Mon FMDD, FMHH12:MI AM TZ');
  PERFORM set_config('TimeZone', v_session_tz, true);

  -- The offer's own window, in whole hours.
  IF v_offered_at IS NOT NULL AND v_offer_expires_at IS NOT NULL THEN
    v_hours := round(extract(epoch FROM (v_offer_expires_at - v_offered_at)) / 3600)::integer;
  END IF;

  v_deadline_line := CASE
    WHEN v_deadline IS NULL
      THEN 'Claim it by paying before the offer ends.'
    WHEN v_hours IS NOT NULL AND v_hours >= 1
      THEN 'You have ' || v_hours || CASE WHEN v_hours = 1 THEN ' hour' ELSE ' hours' END
        || ' to claim it by paying (until ' || v_deadline || ').'
    ELSE 'Claim it by paying before ' || v_deadline || '.'
  END;

  v_body := 'A spot opened'
    || coalesce(' for ' || v_dog_name, '')
    || coalesce(' in ' || v_class_name, '')
    || '. '
    || v_deadline_line
    || ' You pay for this spot only if you claim it. '
    || CASE
         WHEN nullif(btrim(p_payment_link_url), '') IS NOT NULL
           THEN 'Complete payment to claim it: ' || btrim(p_payment_link_url)
         ELSE 'Open My Entries to accept the offer before it expires.'
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
