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
-- 3. A withdrawal tells the exhibitor (owner decision 2026-10-05), through
--    the channels an offer uses, never a new one:
--    - in-app: send_waitlist_withdrawal_message_internal writes the message
--      into the exhibitor's show thread from the secretary who withdrew, as
--      send_waitlist_offer_message_internal does for an offer (its insert
--      sends the chat push);
--    - email + push: waitlist_notification_events admits event_type
--      'withdrawn', delivered by push-trigger-waitlist and retried by
--      cron-waitlist-expiration like every other waitlist event.
--    Copy, in the club's voice: "The club withdrew the spot offered for
--    <dog> in <class> (<trial>, <date>). No payment is due, and the payment
--    link no longer works."
--
-- 4. withdraw_waitlist_offer_internal is the ONE place a withdrawal happens
--    (restructure approved 2026-10-05: two concurrent withdrawals both passed
--    the edge function's re-check, and each sent the exhibitor a notice). In
--    one transaction, under a row lock on the waitlist row, it closes the
--    offer only if it is still 'offered', ends the pending-payment entry the
--    way the expiry path does (promotion-expired, only while unpaid), and
--    ONLY when this call made the transition writes the notices. A second
--    call finds the row closed and returns 'already_closed' having sent
--    nothing. A lapsed offer closes as 'expired' and gets the expiry path's
--    email/push event instead of a withdrawal notice. The notices run in a
--    sub-block, so a failed notice never undoes the withdrawal: the result
--    says notified = false. A mail-in offer is always 'withdrawn' (the expiry
--    job keeps mail-in offers open past the deadline) and gets no email/push
--    event, which push-trigger-waitlist would never deliver; `notified` is true
--    only when a notice that will reach the exhibitor was written.
--    withdraw-waitlist-offer authorizes the caller, calls this FIRST, then
--    expires every open payment link for the entry (Stripe cannot join the
--    transaction). service_role only.
--
-- 5. assert_active_waitlist_offer_payment_link locks the waitlist row before
--    checking it, so a payment link cannot be created across a withdrawal
--    (details at the function).
--
--    Live constraint (pg_constraint, 2026-10-05):
--      waitlist_notification_events_event_type_check
--      CHECK (event_type = ANY (ARRAY['offered','reminder','expired']))
--    enqueue_waitlist_notification_event is copied from
--    20260713010000_waitlist_notification_events.sql (its only definition);
--    only the accepted type list changes.
--
-- Behavioral coverage (CI only):
--   supabase/tests/myk9_1001_waitlist_offer_withdrawn_test.sql
--
-- Applied out of order (live is at 20261005184700): nothing here touches
-- what 20261005163700, 20261005164700 or 20261005184700 define. The entry
-- update in section 4 writes entry_status only, which neither
-- trg_entries_00_direct_write_gate nor trg_entries_capacity_override (164700)
-- fires on, and it runs as the definer, not as a direct client write.
--   supabase/tests/myk9_1003_waitlist_auto_offer_test.sql (M1, W1-W3 copy)
--
-- Deploy order: this migration, then the edge functions withdraw-waitlist-offer
-- (apps/myk9show tree) and push-trigger-waitlist (root tree), then the
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

-- ---------------------------------------------------------------------------
-- 3. The exhibitor is told about a withdrawal
-- ---------------------------------------------------------------------------
ALTER TABLE public.waitlist_notification_events
  DROP CONSTRAINT waitlist_notification_events_event_type_check;

ALTER TABLE public.waitlist_notification_events
  ADD CONSTRAINT waitlist_notification_events_event_type_check
  CHECK (event_type IN ('offered', 'reminder', 'expired', 'withdrawn'));

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
  -- MYK9-1001: 'withdrawn' joins the lifecycle events.
  IF p_event_type NOT IN ('offered', 'reminder', 'expired', 'withdrawn') THEN
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

-- The in-app half. Same shape as send_waitlist_offer_message_internal:
--   'sent'           the message is in the exhibitor's show thread
--   'not_withdrawn'  the row is not withdrawn (nothing to tell)
--   'no_account'     the exhibitor has no app account to message
--   'no_sender'      nobody to send it from
CREATE OR REPLACE FUNCTION public.send_waitlist_withdrawal_message_internal(
  p_waitlist_entry_id uuid,
  p_sender_auth_user_id uuid
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
  v_trial_label text;
  v_thread_id uuid;
  v_body text;
BEGIN
  SELECT t.show_id,
         ep.auth_user_id,
         nullif(btrim(c.name), ''),
         coalesce(nullif(btrim(d.call_name), ''), nullif(btrim(d.name), '')),
         -- "Trial 1 · Sat, Oct 10, 2026": shows repeat a class across trials.
         nullif(concat_ws(' · ', nullif(btrim(t.name), ''),
                          to_char(t.date, 'Dy, Mon FMDD, YYYY')), '')
  INTO v_show_id, v_participant, v_class_name, v_dog_name, v_trial_label
  FROM public.waitlist_entries w
  JOIN public.classes c ON c.id = w.class_id
  JOIN public.trials t ON t.id = c.trial_id
  LEFT JOIN public.exhibitor_profiles ep ON ep.id = w.exhibitor_id
  LEFT JOIN public.dogs d ON d.id = w.dog_id
  WHERE w.id = p_waitlist_entry_id
    AND w.status = 'withdrawn';

  IF NOT FOUND THEN
    RETURN 'not_withdrawn';
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

  v_body := 'The club withdrew the spot offered'
    || coalesce(' for ' || v_dog_name, '')
    || coalesce(' in ' || v_class_name, '')
    || coalesce(' (' || v_trial_label || ')', '')
    || '. No payment is due, and the payment link no longer works.';

  INSERT INTO public.show_messages (show_id, thread_id, sender_id, body)
  VALUES (v_show_id, v_thread_id, p_sender_auth_user_id, v_body);

  RETURN 'sent';
END;
$$;

COMMENT ON FUNCTION public.send_waitlist_withdrawal_message_internal(uuid, uuid) IS
  'MYK9-1001: the exhibitor''s in-app message when the club withdraws a wait list offer; called by withdraw-waitlist-offer after the row is withdrawn.';

REVOKE ALL ON FUNCTION public.send_waitlist_withdrawal_message_internal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_waitlist_withdrawal_message_internal(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The withdrawal itself, atomic with its notices
-- ---------------------------------------------------------------------------
-- Returns jsonb:
--   result          'withdrawn' | 'expired' | 'already_closed' | 'paid' | 'not_found'
--   status          the row's status after the call (null when not found)
--   notified        true only when THIS call wrote a notice that will reach the
--                   exhibitor (the in-app message, or an email/push event for a
--                   row push-trigger-waitlist delivers to)
--   message         the in-app outcome ('sent', 'no_account', ...), withdrawn only
--   event_id        the queued email/push event this call wrote, if any
--   event_type      'withdrawn' or 'expired', with event_id
CREATE OR REPLACE FUNCTION public.withdraw_waitlist_offer_internal(
  p_waitlist_entry_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wl public.waitlist_entries%ROWTYPE;
  v_entry_status text;
  v_payment_status text;
  v_new_status text;
  v_updated integer;
  v_message text;
  v_event_id uuid;
  v_notified boolean := false;
BEGIN
  SELECT * INTO v_wl
  FROM public.waitlist_entries
  WHERE id = p_waitlist_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found', 'status', NULL, 'notified', false);
  END IF;
  IF v_wl.status = 'accepted' THEN
    RETURN jsonb_build_object('result', 'paid', 'status', v_wl.status, 'notified', false);
  END IF;

  -- Money that landed wins: the offer stays for the webhook to resolve.
  IF v_wl.promoted_entry_id IS NOT NULL THEN
    SELECT e.entry_status, e.payment_status
    INTO v_entry_status, v_payment_status
    FROM public.entries e
    WHERE e.id = v_wl.promoted_entry_id
    FOR UPDATE;

    IF v_payment_status = 'paid' OR v_entry_status = 'confirmed' THEN
      RETURN jsonb_build_object('result', 'paid', 'status', v_wl.status, 'notified', false);
    END IF;
  END IF;

  -- A deadline already past closes as the expiry it is, except a mail-in
  -- offer: the expiry job keeps those open past the deadline on purpose (it
  -- never expires them), so a secretary closing one is always withdrawing it.
  v_new_status := CASE
    WHEN v_wl.joined_via = 'mail_in' THEN 'withdrawn'
    WHEN v_wl.offer_expires_at IS NOT NULL AND v_wl.offer_expires_at <= now() THEN 'expired'
    ELSE 'withdrawn'
  END;

  -- THE guard: only an offer still open is closed, so only one call ever makes
  -- this transition and only that call writes the notices below.
  UPDATE public.waitlist_entries
  SET status = v_new_status,
      updated_at = now()
  WHERE id = p_waitlist_entry_id
    AND status = 'offered';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('result', 'already_closed', 'status', v_wl.status, 'notified', false);
  END IF;

  -- The entry the offer created ends the way the expiry path ends it
  -- (expireWaitlistOffer's expirePromotedEntry): promotion-expired, only while
  -- still pending and unpaid.
  IF v_wl.promoted_entry_id IS NOT NULL THEN
    UPDATE public.entries
    SET entry_status = 'promotion-expired'
    WHERE id = v_wl.promoted_entry_id
      AND entry_status = 'pending-payment'
      AND payment_status = 'pending';
  END IF;

  -- This call made the transition, so it alone tells the exhibitor. A failed
  -- notice rolls back only this sub-block, never the withdrawal.
  BEGIN
    IF v_new_status = 'withdrawn' THEN
      v_message := public.send_waitlist_withdrawal_message_internal(
        p_waitlist_entry_id, p_actor_auth_user_id
      );
    END IF;
    -- Email/push only where push-trigger-waitlist will deliver it: its
    -- shouldDeliverWaitlistEvent never sends for a mail-in row, so none is
    -- queued for one (the row is closed, unpaid and on this cycle, which are
    -- its other rules).
    IF v_wl.joined_via IS DISTINCT FROM 'mail_in' THEN
      v_event_id := public.enqueue_waitlist_notification_event(p_waitlist_entry_id, v_new_status);
    END IF;
    -- Told = a notice that will actually reach them was written.
    v_notified := coalesce(v_message = 'sent', false) OR v_event_id IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'withdraw_waitlist_offer_internal: notice for % failed: %',
      p_waitlist_entry_id, SQLERRM;
    v_message := NULL;
    v_event_id := NULL;
    v_notified := false;
  END;

  RETURN jsonb_build_object(
    'result', v_new_status,
    'status', v_new_status,
    'notified', v_notified,
    'message', v_message,
    'event_id', v_event_id,
    'event_type', CASE WHEN v_event_id IS NULL THEN NULL ELSE v_new_status END
  );
END;
$$;

COMMENT ON FUNCTION public.withdraw_waitlist_offer_internal(uuid, uuid) IS
  'MYK9-1001: closes an open wait list offer (withdrawn, or expired when its deadline passed), '
  'ends its pending-payment entry, and writes the exhibitor''s notices only when this call made '
  'the transition. Called by withdraw-waitlist-offer after it authorized the caller and expired '
  'the Stripe checkout page.';

REVOKE ALL ON FUNCTION public.withdraw_waitlist_offer_internal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_waitlist_offer_internal(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. A payment link cannot be created across a withdrawal
-- ---------------------------------------------------------------------------
-- withdraw-waitlist-offer closes the offer in the database FIRST, then expires
-- every open payment link it finds for the entry (Codex round 6 on #2772: a
-- link created between a Stripe-first read and the close stayed payable). For
-- that to see every link, a link must not be created concurrently with the
-- close: this trigger now takes FOR SHARE on the waitlist rows of the entries
-- the link pays for BEFORE it checks them. withdraw_waitlist_offer_internal
-- takes FOR UPDATE on the same row, so the two serialise:
--   * a link inserted first commits before the withdrawal can lock the row,
--     and the edge function's read after the withdrawal commits finds it;
--   * a link attempted after the withdrawal waits for it, then reads the row
--     as closed and is refused (stripe-payment-link then expires the Stripe
--     page it had made and hands out nothing).
-- Copied from 20260713110000_waitlist_offer_payment_guard.sql (its only
-- definition; identical to live, pg_get_functiondef 2026-10-05). Only the
-- lock is added; the checks, error and search_path are unchanged.
CREATE OR REPLACE FUNCTION public.assert_active_waitlist_offer_payment_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- MYK9-1001: serialise with a withdrawal (see above). Fixed order, so two
  -- links over the same entries cannot deadlock each other.
  PERFORM 1
  FROM public.waitlist_entries AS waitlist
  WHERE waitlist.promoted_entry_id = ANY (NEW.entry_ids)
  ORDER BY waitlist.id
  FOR SHARE;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.entry_ids) AS requested(entry_id)
    JOIN public.waitlist_entries AS waitlist
      ON waitlist.promoted_entry_id = requested.entry_id
    JOIN public.entries AS entry
      ON entry.id = waitlist.promoted_entry_id
    WHERE waitlist.status IS DISTINCT FROM 'offered'
       OR waitlist.offer_expires_at IS NULL
       OR waitlist.offer_expires_at <= now()
       OR entry.entry_status NOT IN ('pending-payment', 'pending')
       OR entry.payment_status IS DISTINCT FROM 'pending'
  ) THEN
    RAISE EXCEPTION 'Waitlist offer is no longer active'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_active_waitlist_offer_payment_link() FROM PUBLIC, anon, authenticated;

COMMIT;
