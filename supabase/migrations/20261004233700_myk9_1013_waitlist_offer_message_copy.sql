-- MYK9-1013: the in-app waitlist offer message says plainly what happens next.
--
-- The exhibitor's in-app offer message (the one writer since MYK9-1003,
-- send_waitlist_offer_message_internal) now matches the offer email/push
-- (push-trigger-waitlist/waitlistNotification.ts, PR #2749):
--   a spot opened for {dog} in {class};
--   claim it by paying before {deadline};
--   "You pay for this spot only if you claim it.";
--   then the existing action line (the payment link, or Open My Entries).
--
-- The sentence about money is "You pay for this spot only if you claim it.",
-- not "You haven't been charged anything yet.": a dog moved to the waitlist by
-- a cart overflow can still have a paid charge awaiting refund when it is
-- offered a spot, so a claim about past charges can be false.
--
-- The deadline is the row's offer_expires_at, rendered in the show's zone the
-- way waitlist_class_trial_has_passed (20261004224300) reads it: the show's
-- first trial's timezone, matched against pg_timezone_names, falling back to
-- America/New_York. The format follows the email's en-US medium date + short
-- time ("Jul 15, 2026, 12:00 PM"). With no offer_expires_at the copy reads
-- "before the offer ends".
--
-- Copied from 20261004224300_myk9_1003_waitlist_auto_offer_switch.sql (the
-- only and latest definition). Only the body text changes, plus the two
-- lookups it needs; signature, SECURITY DEFINER, search_path, the return
-- values, the thread/message writes and the grants are unchanged.

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
  v_offer_expires_at timestamptz;
  v_show_tz text;
  v_deadline text;
  v_thread_id uuid;
  v_body text;
BEGIN
  SELECT t.show_id,
         ep.auth_user_id,
         nullif(btrim(c.name), ''),
         coalesce(nullif(btrim(d.call_name), ''), nullif(btrim(d.name), '')),
         w.offer_expires_at
  INTO v_show_id, v_participant, v_class_name, v_dog_name, v_offer_expires_at
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

  -- The show's zone, as waitlist_class_trial_has_passed reads it.
  v_show_tz := COALESCE(
    (SELECT t.timezone
       FROM public.trials t
      WHERE t.show_id = v_show_id
      ORDER BY t.date NULLS LAST, t.id
      LIMIT 1),
    'America/New_York'
  );
  v_show_tz := COALESCE(
    (SELECT n.name FROM pg_catalog.pg_timezone_names n WHERE n.name = v_show_tz),
    'America/New_York'
  );
  v_deadline := to_char(v_offer_expires_at AT TIME ZONE v_show_tz,
                        'Mon FMDD, YYYY, FMHH12:MI AM');

  v_body := 'A spot opened'
    || coalesce(' for ' || v_dog_name, '')
    || coalesce(' in ' || v_class_name, '')
    || '. Claim it by paying before '
    || coalesce(v_deadline, 'the offer ends')
    || '. You pay for this spot only if you claim it. '
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
