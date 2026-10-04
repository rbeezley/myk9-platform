-- MYK9-1003: automatic wait list offers get a per-show switch, tell the
-- secretary, send the same in-app message as a manual offer, and are guarded
-- in the database.
--
-- Owner decision (2026-10-04): keep automatic offers (cron-waitlist-expiration,
-- every 15 minutes), add a per-show OFF switch that defaults ON, and tell the
-- secretary every time an automatic offer goes out.
--
-- What changes
--   1. shows.waitlist_auto_offer boolean NOT NULL DEFAULT true. The default is
--      today's behaviour, so every existing show keeps automatic offers. The
--      Waitlist tab's settings card writes this column and nothing else.
--   2. notifications.type admits 'waitlist_auto_offer': the secretary's notice,
--      delivered by the existing bell / Message Center reader
--      (useAccountNotifications), the surface MYK9-859 built for durable
--      notices.
--   3. send_waitlist_offer_message_internal(...) is the ONE writer of the
--      exhibitor's in-app offer message (show_message_threads + show_messages,
--      whose insert trigger sends the chat push). Before this, only the manual
--      path sent it, from the browser; an automatic offer sent email/push
--      (trg_waitlist_offer_notification) and no in-app message.
--      send_waitlist_offer_message(...) is the manual path's door to it:
--      authenticated, the same authorization as promote_waitlist_entry, and
--      the caller is the sender.
--   4. promote_waitlist_entry_from_cron(uuid) refuses, by returning NULL, to
--      offer when the show's switch is off, the class already has an open
--      offer, the row is not first in line, the row is mail-in, or the class
--      or judge-day is full. All of it is decided under the class lock that
--      promote_waitlist_entry_internal (and so every manual offer) takes. When
--      it does offer, it tells the secretary and sends the in-app message.
--      It moves to SET search_path = '' (SA-027: convert when next edited).
--   5. list_waitlist_offer_candidates() tells the cron which rows to try:
--      the first waiting row of every class in a live show with the switch
--      on, a trial not yet past, and no open offer. It is STABLE: it reads
--      without locking and writes nothing. The edge function then calls
--      promote_waitlist_entry_from_cron once per candidate, each call its own
--      transaction, which re-checks every guard under the class lock.
--   6. No offer, automatic or manual, for a class whose trial date has passed
--      on the show's calendar day (waitlist_class_trial_has_passed): it would
--      ask someone to pay for a trial that is over. A trial dated today is
--      still offered. The manual path had the same gap, so
--      promote_waitlist_entry now refuses it too (22023), and moves to
--      SET search_path = '' (SA-027: convert when next edited).
--
-- Manual offer + automatic offer in the same window
--   Every offer, manual or automatic, runs promote_waitlist_entry_internal
--   under pg_advisory_xact_lock(hashtext(class_id)) and counts the
--   pending-payment entries earlier offers created, so two offers can never
--   share one seat. On top of that the automatic offer re-checks "no open
--   offer in this class" under the same lock, so it never adds a second open
--   offer to a class, whatever the free capacity: a class has two open offers
--   only when a secretary made the second one by hand, into a second free
--   seat. The lock order (waitlist row, then class) is the internal function's
--   own, so a racing manual and automatic offer queue on each other instead of
--   deadlocking.
--
--   One transaction per class, never a batch: promote_waitlist_entry_internal
--   holds its class and judge-day locks to the end of its transaction. A
--   batch that offered class A and then waited for class B would hold A's
--   judge-day lock while a secretary offering B (holding B's locks) waited
--   for that same judge-day: a deadlock that aborts a valid offer. Per-class
--   calls hold one class's locks at a time, as the cron always did.
--
-- The 15-minute pause after an expiry is gone (edge function)
--   The cron used to skip a class whose offer it had just expired until the
--   next tick. Nothing changes between the two ticks: an offer is expired only
--   after its Stripe checkout session is closed (or was never paid) and its
--   pending-payment entry is moved to promotion-expired, so the seat is free
--   and nobody can still pay for it. A late async payment (a session completed
--   unpaid that settles days later) is already handled by the webhook's
--   replacement-offer check and the refund queue, and a 15-minute delay never
--   covered it. The next dog is offered in the same run.
--
-- Deploy order: this migration, then the cron-waitlist-expiration function,
-- then the frontend. The old cron function keeps calling
-- promote_waitlist_entry_from_cron per class; after this migration that call is
-- guarded and returns NULL instead of offering when it must not, so the old
-- function is safe until the new one deploys. The old frontend keeps sending
-- the in-app message itself (no table or policy changes here).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The per-show switch
-- ---------------------------------------------------------------------------
ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS waitlist_auto_offer boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.shows.waitlist_auto_offer IS
  'MYK9-1003: true (the default) lets cron-waitlist-expiration offer a free spot to the next dog in line automatically and tell the secretary; false means the secretary offers every spot by hand from the Waitlist tab.';

-- ---------------------------------------------------------------------------
-- 2. The secretary's notice type
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'entry_confirmed',
  'q_earned',
  'schedule_change',
  'judge_assignment',
  'club_access_approved',
  'waitlist_auto_offer'
));

-- ---------------------------------------------------------------------------
-- 3. The exhibitor's in-app offer message: one writer for both paths
-- ---------------------------------------------------------------------------
-- Returns what happened, for the caller to report:
--   'sent'        the message is in the exhibitor's inbox thread for the show
--   'not_offered' the row is not an open offer (nothing to tell anyone)
--   'no_account'  the exhibitor has no app account to message
--   'no_sender'   nobody to send it from (an automatic offer in a club with
--                 no secretary or club admin)
-- The body is the copy the browser used to build (waitlistOfferMessage.ts).
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
  v_thread_id uuid;
  v_body text;
BEGIN
  SELECT t.show_id,
         ep.auth_user_id,
         nullif(btrim(c.name), ''),
         coalesce(nullif(btrim(d.call_name), ''), nullif(btrim(d.name), ''))
  INTO v_show_id, v_participant, v_class_name, v_dog_name
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

  v_body := 'A waitlist spot'
    || coalesce(' in ' || v_class_name, '')
    || ' just opened up'
    || coalesce(' for ' || v_dog_name, '')
    || '! '
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

COMMENT ON FUNCTION public.send_waitlist_offer_message_internal(uuid, uuid, text) IS
  'MYK9-1003: the one writer of a waitlist offer''s in-app message, for manual (send_waitlist_offer_message) and automatic (promote_waitlist_entry_from_cron) offers alike.';

REVOKE ALL ON FUNCTION public.send_waitlist_offer_message_internal(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_waitlist_offer_message_internal(uuid, uuid, text)
  TO service_role;

-- The manual path: the secretary's browser calls this after promote_waitlist_entry
-- and the payment link. Same authorization as promote_waitlist_entry; the
-- caller is the sender, exactly as when the browser wrote the message itself.
CREATE OR REPLACE FUNCTION public.send_waitlist_offer_message(
  p_waitlist_entry_id uuid,
  p_payment_link_url text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
BEGIN
  SELECT t.show_id, s.club_id
  INTO v_show_id, v_club_id
  FROM public.waitlist_entries w
  JOIN public.classes c ON c.id = w.class_id
  JOIN public.trials t ON t.id = c.trial_id
  JOIN public.shows s ON s.id = t.show_id
  WHERE w.id = p_waitlist_entry_id;

  IF NOT (
    public.is_show_secretary(v_show_id)
    OR public.is_club_admin(v_club_id)
    OR public.is_site_admin()
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_payment_link_url IS NOT NULL
     AND (p_payment_link_url !~ '^https://' OR length(p_payment_link_url) > 2048) THEN
    RAISE EXCEPTION 'payment link must be an https URL' USING ERRCODE = '22023';
  END IF;

  RETURN public.send_waitlist_offer_message_internal(
    p_waitlist_entry_id,
    auth.uid(),
    p_payment_link_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_waitlist_offer_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_waitlist_offer_message(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- The secretary's notice for an automatic offer, plus the exhibitor's message
-- ---------------------------------------------------------------------------
-- Recipients: the club's appointed secretaries (the grant is_show_secretary
-- reads), or its club admins when it has no secretary. The earliest-appointed
-- recipient is the message's sender. Returns the in-app message outcome.
CREATE OR REPLACE FUNCTION public.notify_waitlist_auto_offer(p_waitlist_entry_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_class_name text;
  v_dog_name text;
  v_hours integer;
  v_sender uuid;
  v_recipient record;
BEGIN
  SELECT t.show_id,
         s.club_id,
         coalesce(nullif(btrim(c.name), ''), 'a class'),
         coalesce(nullif(btrim(d.call_name), ''), nullif(btrim(d.name), ''), 'The next dog'),
         greatest(1, ceil(extract(epoch FROM (w.offer_expires_at - w.offered_at)) / 3600))::integer
  INTO v_show_id, v_club_id, v_class_name, v_dog_name, v_hours
  FROM public.waitlist_entries w
  JOIN public.classes c ON c.id = w.class_id
  JOIN public.trials t ON t.id = c.trial_id
  JOIN public.shows s ON s.id = t.show_id
  LEFT JOIN public.dogs d ON d.id = w.dog_id
  WHERE w.id = p_waitlist_entry_id
    AND w.status = 'offered';

  IF NOT FOUND THEN
    RETURN 'not_offered';
  END IF;

  FOR v_recipient IN
    WITH staff AS (
      SELECT ur.auth_user_id, r.name AS role_name, min(ur.granted_at) AS granted_at
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE r.name IN ('secretary', 'club_admin')
        AND ur.club_id = v_club_id
        AND ur.show_id IS NULL
        AND ur.is_active
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
        AND ur.auth_user_id IS NOT NULL
      GROUP BY ur.auth_user_id, r.name
    )
    SELECT staff.auth_user_id, min(staff.granted_at) AS granted_at
    FROM staff
    WHERE staff.role_name = 'secretary'
       OR NOT EXISTS (SELECT 1 FROM staff s2 WHERE s2.role_name = 'secretary')
    GROUP BY staff.auth_user_id
    ORDER BY min(staff.granted_at) NULLS LAST, staff.auth_user_id
  LOOP
    v_sender := coalesce(v_sender, v_recipient.auth_user_id);

    INSERT INTO public.notifications (user_id, type, message, deep_link_url)
    VALUES (
      v_recipient.auth_user_id,
      'waitlist_auto_offer',
      format(
        '%s was offered the open spot in %s automatically. The spot is held for %s hours for payment. You can turn automatic offers off in Wait list settings.',
        v_dog_name,
        v_class_name,
        v_hours
      ),
      '/shows/' || v_show_id || '/entries?tab=waitlist'
    );
  END LOOP;

  RETURN public.send_waitlist_offer_message_internal(p_waitlist_entry_id, v_sender, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_waitlist_auto_offer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_waitlist_auto_offer(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Past trials (item 6 above): has the class's trial date passed?
-- ---------------------------------------------------------------------------
-- The entry-close guard's calendar-day rule (submit_show_entries, MYK9-642 /
-- 20261003221700): the show's zone is its first trial's timezone, matched
-- against pg_timezone_names and falling back to America/New_York, and "today"
-- is now() in that zone. trials.date is a plain date. A trial dated today has
-- not passed; a trial with no date is never treated as past.
CREATE OR REPLACE FUNCTION public.waitlist_class_trial_has_passed(p_class_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trial_date date;
  v_show_id uuid;
  v_show_tz text;
BEGIN
  SELECT t.date, t.show_id
  INTO v_trial_date, v_show_id
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF v_trial_date IS NULL THEN
    RETURN false;
  END IF;

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

  RETURN v_trial_date < (now() AT TIME ZONE v_show_tz)::date;
END;
$$;

REVOKE ALL ON FUNCTION public.waitlist_class_trial_has_passed(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_class_trial_has_passed(uuid) TO service_role;

-- The manual offer refuses a past trial too. Copied from
-- 20260622000222_link_waitlist_promotions.sql (its only definition, identical
-- live); the trial-date refusal is new, and every reference is now qualified
-- for the empty search_path.
CREATE OR REPLACE FUNCTION public.promote_waitlist_entry(
  p_waitlist_entry_id uuid,
  p_deadline_hours integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_class_id uuid;
BEGIN
  SELECT t.show_id, s.club_id, wl.class_id
  INTO v_show_id, v_club_id, v_class_id
  FROM public.waitlist_entries wl
  JOIN public.classes c ON c.id = wl.class_id
  JOIN public.trials t ON t.id = c.trial_id
  JOIN public.shows s ON s.id = t.show_id
  WHERE wl.id = p_waitlist_entry_id;

  IF NOT (
    public.is_show_secretary(v_show_id)
    OR public.is_club_admin(v_club_id)
    OR public.is_site_admin()
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF public.waitlist_class_trial_has_passed(v_class_id) THEN
    RAISE EXCEPTION 'This trial has already taken place, so its wait list spots cannot be offered.'
      USING ERRCODE = '22023';
  END IF;

  RETURN public.promote_waitlist_entry_internal(p_waitlist_entry_id, p_deadline_hours);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_waitlist_entry(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_entry(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The guarded automatic offer
-- ---------------------------------------------------------------------------
-- Rewritten from 20260622000222_link_waitlist_promotions.sql (its only
-- definition): that body only forwarded to promote_waitlist_entry_internal.
CREATE OR REPLACE FUNCTION public.promote_waitlist_entry_from_cron(
  p_waitlist_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wl public.waitlist_entries%ROWTYPE;
  v_auto_offer boolean;
  v_new_entry_id uuid;
BEGIN
  -- promote_waitlist_entry_internal's own lock order: the row, then the class.
  PERFORM pg_advisory_xact_lock(hashtext(p_waitlist_entry_id::text));

  SELECT *
  INTO v_wl
  FROM public.waitlist_entries
  WHERE id = p_waitlist_entry_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_wl.status IS DISTINCT FROM 'waiting'
     OR v_wl.joined_via = 'mail_in' THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_wl.class_id::text));

  SELECT s.waitlist_auto_offer
  INTO v_auto_offer
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  JOIN public.shows s ON s.id = t.show_id
  WHERE c.id = v_wl.class_id;

  -- The secretary turned automatic offers off for this show.
  IF NOT coalesce(v_auto_offer, false) THEN
    RETURN NULL;
  END IF;

  -- Never ask anyone to pay for a trial that is over.
  IF public.waitlist_class_trial_has_passed(v_wl.class_id) THEN
    RETURN NULL;
  END IF;

  -- At most one open offer per class from the system; read under the class
  -- lock, so a manual offer that committed first is seen here.
  IF EXISTS (
    SELECT 1
    FROM public.waitlist_entries o
    WHERE o.class_id = v_wl.class_id
      AND o.status = 'offered'
  ) THEN
    RETURN NULL;
  END IF;

  -- Only the dog first in line.
  IF EXISTS (
    SELECT 1
    FROM public.waitlist_entries w
    WHERE w.class_id = v_wl.class_id
      AND w.status = 'waiting'
      AND w.position < v_wl.position
  ) THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_new_entry_id := public.promote_waitlist_entry_internal(p_waitlist_entry_id, NULL);
  EXCEPTION WHEN raise_exception THEN
    -- No free seat this tick. Anything else is a real failure and propagates.
    IF SQLERRM IN ('Class is full', 'Judge-day capacity is full') THEN
      RETURN NULL;
    END IF;
    RAISE;
  END;

  -- Telling people never blocks the offer itself: the offer, its email and
  -- its push (trg_waitlist_offer_notification) stand even if this fails.
  BEGIN
    PERFORM public.notify_waitlist_auto_offer(p_waitlist_entry_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'waitlist auto-offer notice failed for % (SQLSTATE %)',
      p_waitlist_entry_id, SQLSTATE;
  END;

  RETURN v_new_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_waitlist_entry_from_cron(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_entry_from_cron(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The cron's candidate list
-- ---------------------------------------------------------------------------
-- The first waiting row of each class the cron may offer: live show with the
-- switch on, trial not past, no open offer in the class. A mail-in first row
-- is listed (joined_via says so) so the cron can report it; it is never
-- offered. STABLE: a plain read, so it takes no row locks and cannot write.
-- The cron offers each candidate in its own call to
-- promote_waitlist_entry_from_cron, which re-checks all of this under the
-- class lock; this list is only a starting point.
CREATE OR REPLACE FUNCTION public.list_waitlist_offer_candidates()
RETURNS TABLE (
  class_id uuid,
  waitlist_entry_id uuid,
  joined_via text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT ON (w.class_id) w.class_id, w.id, w.joined_via
  FROM public.waitlist_entries w
  JOIN public.classes c ON c.id = w.class_id
  JOIN public.trials t ON t.id = c.trial_id
  JOIN public.shows s ON s.id = t.show_id
  WHERE w.status = 'waiting'
    AND s.waitlist_auto_offer
    AND c.deleted_at IS NULL
    AND t.deleted_at IS NULL
    AND s.deleted_at IS NULL
    AND NOT public.waitlist_class_trial_has_passed(w.class_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.waitlist_entries o
      WHERE o.class_id = w.class_id
        AND o.status = 'offered'
    )
  ORDER BY w.class_id, w.position, w.id;
$$;

REVOKE ALL ON FUNCTION public.list_waitlist_offer_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_waitlist_offer_candidates() TO service_role;

COMMIT;
