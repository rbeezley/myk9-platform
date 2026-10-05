-- MYK9-1001 / MYK9-1002 (migration 20261005152300): a secretary can withdraw
-- an open wait list offer, and the offer message states its window in hours.
--
-- Properties asserted here:
--   W1  withdraw_waitlist_offer_internal on an open offer: the row becomes
--       'withdrawn', its pending-payment entry 'promotion-expired', and the
--       exhibitor is told exactly once: one in-app message (to the row's
--       exhibitor, from the secretary, naming dog, class and trial, saying no
--       payment is due) and one 'withdrawn' email/push event. A SECOND call on
--       the same row returns 'already_closed' and writes nothing: the guard
--       that stops two concurrent withdrawals both notifying.
--   L1  An offer whose deadline already passed closes as 'expired' with the
--       expiry path's 'expired' event and no withdrawal message.
--   P1  An offer whose entry is already paid is refused ('paid'): row, entry,
--       events and messages untouched.
--   N1  A missing row answers 'not_found'.
--   C1  waitlist_entries.status admits 'withdrawn' and still refuses an
--       unknown status; the event queue still refuses an unknown type.
--   C2  A withdrawn row frees the dog to join the wait list again.
--   M1  The offer message (copy per 20261005235100): a one-hour window reads "You have 1 hour"
--       (singular), and the deadline carries the trial zone's abbreviation
--       (America/Phoenix: MST, no DST).
--   MI1 A MAIL-IN offer past its deadline is withdrawn, not expired (the
--       expiry job keeps mail-in offers open), gets the in-app message and no
--       email/push event (never delivered for mail-in), and notified = true
--       because the message will reach the exhibitor.
--   PL1 After a withdrawal, a payment link for that entry is refused.
--   PL2 Creating a payment link takes a FOR SHARE lock on the offer's
--       waitlist row before checking it, so it serialises with a withdrawal
--       (which takes FOR UPDATE): the row's xmax is this transaction's.
--   A1  withdraw_waitlist_offer_internal, send_waitlist_withdrawal_message_internal
--       and enqueue_waitlist_notification_event are SECURITY DEFINER with
--       search_path '' and EXECUTE for service_role only; anon and
--       authenticated callers are refused (42501).
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

CREATE FUNCTION pg_temp.expect_eq(p_actual text, p_expected text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL %: got %, expected %', p_label, p_actual, p_expected;
  END IF;
  RAISE NOTICE 'PASS %', p_label;
END;
$f$;

CREATE FUNCTION pg_temp.expect_sqlstate(p_sql text, p_state text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'FAIL %: SQLSTATE % (%), expected %', p_label, SQLSTATE, SQLERRM, p_state;
    END IF;
    RAISE NOTICE 'PASS % (% %)', p_label, p_state, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: succeeded, expected SQLSTATE %', p_label, p_state;
END;
$f$;

-- Fixture ids: 00000000-0000-0000-0000-000001001<nnn>.
CREATE FUNCTION pg_temp.fid(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000001001' || p_suffix)::uuid
$f$;

-- ---------------------------------------------------------------------------
-- Fixtures: club 001, show 101, trial 201 ('Saturday Trial', 2026-10-10,
-- America/Phoenix), class 301; exhibitor person 011 (auth 021) owns dogs
-- 401-405; person 012 (auth 022) is the secretary who acts and sends.
--   501 dog 401  offered, deadline ahead, entry 601 pending-payment   (W1, C2)
--   502 dog 402  offered, deadline passed, entry 602 pending-payment  (L1)
--   503 dog 403  offered, entry 603 already paid                       (P1)
--   504 dog 404  offered with a one-hour window in July, no entry      (M1)
--   505 dog 405  waiting                                               (C1)
--   507 dog 406  MAIL-IN offered, deadline passed, entry 607 pending   (MI1)
--   508 dog 407  offered, deadline ahead, entry 608 pending            (PL2)
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name) VALUES (pg_temp.fid('001'), 'MYK9-1001 Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (pg_temp.fid('011'), 'MYK9-1001', 'Exhibitor', 'myk9-1001-exh@example.test'),
  (pg_temp.fid('012'), 'MYK9-1001', 'Outsider', 'myk9-1001-out@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT pg_temp.fid(v.auth_suffix), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', v.email, '', now(), now(), now(),
       '{}', '{}', false, false, false
FROM (VALUES
  ('021', 'myk9-1001-exh@example.test'),
  ('022', 'myk9-1001-out@example.test')
) AS v(auth_suffix, email);

UPDATE public.people p
SET auth_user_id = pg_temp.fid(v.auth_suffix)
FROM (VALUES ('011', '021'), ('012', '022')) AS v(person_suffix, auth_suffix)
WHERE p.id = pg_temp.fid(v.person_suffix);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT pg_temp.fid('011'), pg_temp.fid('021')
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                  WHERE auth_user_id = pg_temp.fid('021'));

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES (pg_temp.fid('101'), 'MYK9-1001 Show', 'AKC',
        current_date + 30, current_date + 30, 'draft', pg_temp.fid('001'));

INSERT INTO public.trials (id, show_id, name, date, timezone)
VALUES (pg_temp.fid('201'), pg_temp.fid('101'), 'Saturday Trial', current_date + 30,
        'America/Phoenix');
-- A fixed date, so the trial label in the withdrawal notice is a known answer.
UPDATE public.trials SET date = '2026-10-10' WHERE id = pg_temp.fid('201');

INSERT INTO public.classes (id, trial_id, name, status, status_source, max_entries, allow_waitlist)
VALUES (pg_temp.fid('301'), pg_temp.fid('201'), 'Class Waitlist', 'upcoming', 'derived', 5, true);

INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT pg_temp.fid((400 + n)::text), 'Dog' || (400 + n), 'Beagle', pg_temp.fid('011')
FROM generate_series(1, 7) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT pg_temp.fid((400 + n)::text), 'AKC', 'SW1001' || n, 'Dog ' || n || ' Formally'
FROM generate_series(1, 7) AS n;

-- The entries the offers created (promote_waitlist_entry_internal's insert).
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status)
VALUES
  (pg_temp.fid('601'), pg_temp.fid('401'), pg_temp.fid('301'), pg_temp.fid('101'),
   pg_temp.fid('201'), 'pending-payment', 'pending'),
  (pg_temp.fid('602'), pg_temp.fid('402'), pg_temp.fid('301'), pg_temp.fid('101'),
   pg_temp.fid('201'), 'pending-payment', 'pending'),
  (pg_temp.fid('607'), pg_temp.fid('406'), pg_temp.fid('301'), pg_temp.fid('101'),
   pg_temp.fid('201'), 'pending-payment', 'pending'),
  (pg_temp.fid('608'), pg_temp.fid('407'), pg_temp.fid('301'), pg_temp.fid('101'),
   pg_temp.fid('201'), 'pending-payment', 'pending');
-- 603 was paid: written in one statement as service_role, as the webhook does.
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status)
VALUES (pg_temp.fid('603'), pg_temp.fid('403'), pg_temp.fid('301'), pg_temp.fid('101'),
        pg_temp.fid('201'), 'pending-payment', 'paid');
RESET ROLE;

INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position, status, joined_via,
  offered_at, offer_expires_at, promoted_entry_id
)
SELECT pg_temp.fid(v.id), pg_temp.fid('301'), ep.id, pg_temp.fid(v.dog), v.pos, v.status,
       v.joined_via, v.offered_at, v.expires_at, v.entry
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES
  ('501', '401', 1, 'offered', 'online', now() - interval '1 hour', now() + interval '47 hours',
   pg_temp.fid('601')),
  ('502', '402', 2, 'offered', 'online', now() - interval '3 days', now() - interval '1 day',
   pg_temp.fid('602')),
  ('503', '403', 3, 'offered', 'online', now() - interval '1 hour', now() + interval '47 hours',
   pg_temp.fid('603')),
  ('504', '404', 4, 'offered', 'online', timestamptz '2026-07-15 17:00:00+00',
   timestamptz '2026-07-15 18:00:00+00', NULL::uuid),
  ('505', '405', 5, 'waiting', 'online', NULL::timestamptz, NULL::timestamptz, NULL::uuid),
  ('507', '406', 7, 'offered', 'mail_in', now() - interval '3 days', now() - interval '1 day',
   pg_temp.fid('607')),
  ('508', '407', 8, 'offered', 'online', now() - interval '1 hour', now() + interval '47 hours',
   pg_temp.fid('608'))
) AS v(id, dog, pos, status, joined_via, offered_at, expires_at, entry)
WHERE ep.auth_user_id = pg_temp.fid('021');

CREATE FUNCTION pg_temp.withdrawal_messages(p_dog text)
RETURNS integer LANGUAGE sql AS $f$
  SELECT count(*)::integer FROM public.show_messages m
  WHERE m.show_id = pg_temp.fid('101')
    AND m.body LIKE 'The club withdrew the spot offered for ' || p_dog || ' %'
$f$;

CREATE FUNCTION pg_temp.events(p_row text)
RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(e.event_type, ',' ORDER BY e.event_type), '')
  FROM public.waitlist_notification_events e
  WHERE e.waitlist_entry_id = pg_temp.fid(p_row)
$f$;

-- ---------------------------------------------------------------------------
-- W1. One withdrawal, told once; the second call changes nothing
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE w1_results (call integer, result jsonb);
GRANT ALL ON w1_results TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO w1_results
SELECT 1, public.withdraw_waitlist_offer_internal(pg_temp.fid('501'), pg_temp.fid('022'));
INSERT INTO w1_results
SELECT 2, public.withdraw_waitlist_offer_internal(pg_temp.fid('501'), pg_temp.fid('022'));
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT r.result->>'result' || ' ' || (r.result->>'notified') || ' ' || (r.result->>'message')
            || ' ' || (r.result->>'event_type') || ' ' || ((r.result->>'event_id') IS NOT NULL)::text
       FROM w1_results r WHERE r.call = 1),
    'withdrawn true sent withdrawn true', 'W1 the first call withdraws and tells the exhibitor');
  PERFORM pg_temp.expect_eq(
    (SELECT r.result->>'result' || ' ' || (r.result->>'status') || ' ' || (r.result->>'notified')
            || ' ' || coalesce(r.result->>'event_id', 'no-event')
       FROM w1_results r WHERE r.call = 2),
    'already_closed withdrawn false no-event', 'W1 the second call finds it closed and sends nothing');
  PERFORM pg_temp.expect_eq(
    (SELECT w.status || ' ' || e.entry_status
       FROM public.waitlist_entries w JOIN public.entries e ON e.id = w.promoted_entry_id
      WHERE w.id = pg_temp.fid('501')),
    'withdrawn promotion-expired', 'W1 the row is withdrawn and its entry promotion-expired');
  PERFORM pg_temp.expect_eq(pg_temp.withdrawal_messages('Dog401')::text, '1',
    'W1 exactly one in-app message');
  PERFORM pg_temp.expect_eq(pg_temp.events('501'), 'withdrawn',
    'W1 exactly one email/push event, of type withdrawn');
  PERFORM pg_temp.expect_eq(
    (SELECT t.participant_id::text || ' | ' || m.sender_id::text || ' | ' || m.body
       FROM public.show_messages m
       JOIN public.show_message_threads t ON t.id = m.thread_id
      WHERE m.show_id = pg_temp.fid('101') AND m.body LIKE 'The club withdrew%'),
    pg_temp.fid('021')::text || ' | ' || pg_temp.fid('022')::text
      || ' | The club withdrew the spot offered for Dog401 in Class Waitlist (Saturday Trial · Sat, Oct 10, 2026). No payment is due, and the payment link no longer works.',
    'W1 to the exhibitor, from the secretary, naming dog, class and trial');
  PERFORM pg_temp.expect_eq(
    (SELECT (e.offer_cycle_at = w.offered_at)::text || ' ' || e.status
       FROM public.waitlist_notification_events e
       JOIN public.waitlist_entries w ON w.id = e.waitlist_entry_id
      WHERE e.waitlist_entry_id = pg_temp.fid('501')),
    'true pending', 'W1 the event is for the row''s offer cycle, pending delivery');
END;
$$;

-- ---------------------------------------------------------------------------
-- L1 / P1 / N1. Lapsed, paid, missing
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE other_results (k text, result jsonb);
GRANT ALL ON other_results TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO other_results
SELECT 'lapsed', public.withdraw_waitlist_offer_internal(pg_temp.fid('502'), pg_temp.fid('022'));
INSERT INTO other_results
SELECT 'paid', public.withdraw_waitlist_offer_internal(pg_temp.fid('503'), pg_temp.fid('022'));
INSERT INTO other_results
SELECT 'missing', public.withdraw_waitlist_offer_internal(pg_temp.fid('599'), pg_temp.fid('022'));
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT r.result->>'result' || ' ' || (r.result->>'notified') || ' '
            || coalesce(r.result->>'message', 'no-message') || ' ' || (r.result->>'event_type')
       FROM other_results r WHERE r.k = 'lapsed'),
    'expired true no-message expired', 'L1 a lapsed offer closes as expired with the expiry notice');
  PERFORM pg_temp.expect_eq(
    (SELECT w.status || ' ' || e.entry_status
       FROM public.waitlist_entries w JOIN public.entries e ON e.id = w.promoted_entry_id
      WHERE w.id = pg_temp.fid('502')),
    'expired promotion-expired', 'L1 the row is expired and its entry promotion-expired');
  PERFORM pg_temp.expect_eq(pg_temp.withdrawal_messages('Dog402')::text || ' ' || pg_temp.events('502'),
    '0 expired', 'L1 no withdrawal message; only the expired event');

  PERFORM pg_temp.expect_eq(
    (SELECT r.result->>'result' || ' ' || (r.result->>'notified') FROM other_results r
      WHERE r.k = 'paid'),
    'paid false', 'P1 a paid offer is refused');
  PERFORM pg_temp.expect_eq(
    (SELECT w.status || ' ' || e.entry_status || ' ' || e.payment_status
       FROM public.waitlist_entries w JOIN public.entries e ON e.id = w.promoted_entry_id
      WHERE w.id = pg_temp.fid('503')),
    'offered pending-payment paid', 'P1 the row and its entry are untouched');
  PERFORM pg_temp.expect_eq(pg_temp.withdrawal_messages('Dog403')::text || ' ' || pg_temp.events('503'),
    '0 ', 'P1 nothing is sent');

  PERFORM pg_temp.expect_eq(
    (SELECT r.result->>'result' FROM other_results r WHERE r.k = 'missing'),
    'not_found', 'N1 a missing row is not_found');
END;
$$;

-- ---------------------------------------------------------------------------
-- MI1. A mail-in offer past its deadline is withdrawn, told in-app only
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE mi_results (result jsonb);
GRANT ALL ON mi_results TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO mi_results
SELECT public.withdraw_waitlist_offer_internal(pg_temp.fid('507'), pg_temp.fid('022'));
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT r.result->>'result' || ' ' || (r.result->>'notified') || ' ' || (r.result->>'message')
            || ' ' || coalesce(r.result->>'event_id', 'no-event') FROM mi_results r),
    'withdrawn true sent no-event', 'MI1 a lapsed mail-in offer is withdrawn and told in-app only');
  PERFORM pg_temp.expect_eq(
    (SELECT w.status || ' ' || e.entry_status
       FROM public.waitlist_entries w JOIN public.entries e ON e.id = w.promoted_entry_id
      WHERE w.id = pg_temp.fid('507')),
    'withdrawn promotion-expired', 'MI1 the row is withdrawn and its entry promotion-expired');
  PERFORM pg_temp.expect_eq(pg_temp.withdrawal_messages('Dog406')::text || ' ' || pg_temp.events('507'),
    '1 ', 'MI1 one in-app message, no email/push event');
END;
$$;

-- ---------------------------------------------------------------------------
-- PL1 / PL2. Payment links and the withdrawal
-- ---------------------------------------------------------------------------
-- PL1: 501 was withdrawn in W1.
SELECT pg_temp.expect_sqlstate(
  $q$INSERT INTO public.entry_payment_links (show_id, entry_ids, stripe_checkout_session_id, status, amount_cents)
     VALUES ('00000000-0000-0000-0000-000001001101',
             ARRAY['00000000-0000-0000-0000-000001001601']::uuid[], 'cs_1001_after', 'open', 2500)$q$,
  '23514', 'PL1 a payment link for a withdrawn offer''s entry is refused');

-- PL2: a link for an open offer goes in, and locks the offer's row as it does.
INSERT INTO public.entry_payment_links (show_id, entry_ids, stripe_checkout_session_id, status, amount_cents)
VALUES (pg_temp.fid('101'), ARRAY[pg_temp.fid('608')], 'cs_1001_open', 'open', 2500);

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT (w.xmax = xid(pg_current_xact_id()))::text
       FROM public.waitlist_entries w WHERE w.id = pg_temp.fid('508')),
    'true', 'PL2 the link insert locked the offer''s waitlist row (FOR SHARE) before checking it');
END;
$$;

-- ---------------------------------------------------------------------------
-- C1 / C2. The statuses
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_sqlstate(
  $q$UPDATE public.waitlist_entries SET status = 'rescinded'
     WHERE id = '00000000-0000-0000-0000-000001001505'$q$,
  '23514', 'C1 an unknown status is still refused');

DO $$
BEGIN
  UPDATE public.waitlist_entries SET status = 'withdrawn' WHERE id = pg_temp.fid('505');
  PERFORM pg_temp.expect_eq(
    (SELECT status FROM public.waitlist_entries WHERE id = pg_temp.fid('505')),
    'withdrawn', 'C1 the status CHECK admits withdrawn');

  INSERT INTO public.waitlist_entries (id, class_id, exhibitor_id, dog_id, position, status, joined_via)
  SELECT pg_temp.fid('506'), pg_temp.fid('301'), ep.id, pg_temp.fid('401'), 6, 'waiting', 'online'
  FROM public.exhibitor_profiles ep
  WHERE ep.auth_user_id = pg_temp.fid('021');

  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(status, ',' ORDER BY position) FROM public.waitlist_entries
      WHERE class_id = pg_temp.fid('301') AND dog_id = pg_temp.fid('401')),
    'withdrawn,waiting', 'C2 a withdrawn dog can join the wait list again');
END;
$$;

SET LOCAL ROLE service_role;
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.enqueue_waitlist_notification_event('00000000-0000-0000-0000-000001001501', 'rescinded')$q$,
  '22023', 'C1 an unknown event type is still refused');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- M1. The offer message's window and zone
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    public.send_waitlist_offer_message_internal(pg_temp.fid('504'), pg_temp.fid('022'), NULL),
    'sent', 'M1 setup: message sent');
END;
$$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT m.body FROM public.show_messages m
      WHERE m.show_id = pg_temp.fid('101') AND m.body LIKE 'A spot opened%'),
    'A spot opened for Dog404 in Class Waitlist. You have 1 hour to pay (until Wed, Jul 15, 11:00 AM MST). You pay for this spot only if you claim it. Open My Entries to accept the offer before it expires.',
    'M1 one hour reads singular, and the deadline names the trial zone (Phoenix, MST)');
  PERFORM pg_temp.expect_eq((current_setting('TimeZone') <> 'America/Phoenix')::text,
    'true', 'M1 the session zone is put back after rendering');
END;
$$;

-- ---------------------------------------------------------------------------
-- A1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.withdraw_waitlist_offer_internal(uuid,uuid)',
    'public.send_waitlist_withdrawal_message_internal(uuid,uuid)',
    'public.enqueue_waitlist_notification_event(uuid,text)'
  ] LOOP
    PERFORM pg_temp.expect_eq(
      (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
         FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
      'true search_path=""', 'A1 ' || v_fn || ' SECURITY DEFINER, empty search_path');
    PERFORM pg_temp.expect_eq(
      has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
        || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
        || has_function_privilege('service_role', v_fn, 'EXECUTE'),
      'false false true', 'A1 ' || v_fn || ' EXECUTE: service_role only');
  END LOOP;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001001022', true);
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.withdraw_waitlist_offer_internal('00000000-0000-0000-0000-000001001503', '00000000-0000-0000-0000-000001001022')$q$,
  '42501', 'A1 a signed-in user cannot call the withdrawal directly');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.withdraw_waitlist_offer_internal('00000000-0000-0000-0000-000001001503', NULL)$q$,
  '42501', 'A1 anon cannot call the withdrawal');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

ROLLBACK;
