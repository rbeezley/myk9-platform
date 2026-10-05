-- MYK9-1001 / MYK9-1002 (migration 20261005152300): a secretary can withdraw
-- an open wait list offer, and the offer message states its window in hours.
--
-- Properties asserted here:
--   C1  waitlist_entries.status admits 'withdrawn' (the secretary's
--       withdraw-waitlist-offer writes it) and still refuses an unknown status.
--   C2  A withdrawn row frees the dog: the dog can join the class's wait list
--       again (the one-live-row index covers only waiting and offered).
--   M1  A one-hour window reads "You have 1 hour" (singular), and the deadline
--       carries the trial zone's abbreviation (America/Phoenix: MST, no DST).
--   N1  The withdrawal's in-app message goes to the exhibitor (the row's
--       exhibitor's auth user) from the secretary, naming the dog, the class
--       and the trial, in the club's voice: no payment is due and the payment
--       link no longer works. Only a withdrawn row gets one.
--   N2  The email/push queue admits a 'withdrawn' event for the row's offer
--       cycle and still refuses an unknown type.
--   A1  send_waitlist_withdrawal_message_internal and
--       enqueue_waitlist_notification_event are SECURITY DEFINER with
--       search_path '' and EXECUTE for service_role only.
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
-- Fixtures: club 001, show 101, trial 201, class 301; exhibitor person 011
-- (auth 021) owns dogs 401-402, offered as rows 501-502; person 012 (auth
-- 022) is the message sender.
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
VALUES (pg_temp.fid('201'), pg_temp.fid('101'), 'MYK9-1001 Trial', current_date + 30,
        'America/Phoenix');

INSERT INTO public.classes (id, trial_id, name, status, status_source, max_entries, allow_waitlist)
VALUES (pg_temp.fid('301'), pg_temp.fid('201'), 'Class Waitlist', 'upcoming', 'derived', 5, true);

INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT pg_temp.fid((400 + n)::text), 'Dog' || (400 + n), 'Beagle', pg_temp.fid('011')
FROM generate_series(1, 2) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT pg_temp.fid((400 + n)::text), 'AKC', 'SW1001' || n, 'Dog ' || n || ' Formally'
FROM generate_series(1, 2) AS n;

INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position, status, joined_via, offered_at, offer_expires_at
)
SELECT pg_temp.fid(v.id), pg_temp.fid('301'), ep.id, pg_temp.fid(v.dog), v.pos, 'offered', 'online',
       '2026-07-15 17:00:00+00', '2026-07-15 18:00:00+00'
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES ('501', '401', 1), ('502', '402', 2)) AS v(id, dog, pos)
WHERE ep.auth_user_id = pg_temp.fid('021');

-- ---------------------------------------------------------------------------
-- C1 / C2. The status
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT pg_get_constraintdef(c.oid) LIKE '%''withdrawn''%'
       FROM pg_constraint c
      WHERE c.conrelid = 'public.waitlist_entries'::regclass
        AND c.conname = 'waitlist_entries_status_check')::text,
    'true', 'C1 the status CHECK names withdrawn');

  UPDATE public.waitlist_entries SET status = 'withdrawn' WHERE id = pg_temp.fid('501');
  PERFORM pg_temp.expect_eq(
    (SELECT status FROM public.waitlist_entries WHERE id = pg_temp.fid('501')),
    'withdrawn', 'C1 an offered row moves to withdrawn');
END;
$$;

SELECT pg_temp.expect_sqlstate(
  $q$UPDATE public.waitlist_entries SET status = 'rescinded'
     WHERE id = '00000000-0000-0000-0000-000001001502'$q$,
  '23514', 'C1 an unknown status is still refused');

DO $$
BEGIN
  INSERT INTO public.waitlist_entries (id, class_id, exhibitor_id, dog_id, position, status, joined_via)
  SELECT pg_temp.fid('503'), pg_temp.fid('301'), ep.id, pg_temp.fid('401'), 3, 'waiting', 'online'
  FROM public.exhibitor_profiles ep
  WHERE ep.auth_user_id = pg_temp.fid('021');

  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(status, ',' ORDER BY position) FROM public.waitlist_entries
      WHERE class_id = pg_temp.fid('301') AND dog_id = pg_temp.fid('401')),
    'withdrawn,waiting', 'C2 a withdrawn dog can join the wait list again');
END;
$$;

-- ---------------------------------------------------------------------------
-- M1. The message's window and zone
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    public.send_waitlist_offer_message_internal(pg_temp.fid('502'), pg_temp.fid('022'), NULL),
    'sent', 'M1 setup: message sent');
END;
$$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT m.body FROM public.show_messages m WHERE m.show_id = pg_temp.fid('101')),
    'A spot opened for Dog402 in Class Waitlist. You have 1 hour to claim it by paying (until Wed, Jul 15, 11:00 AM MST). You pay for this spot only if you claim it. Open My Entries to accept the offer before it expires.',
    'M1 one hour reads singular, and the deadline names the trial zone (Phoenix, MST)');
  PERFORM pg_temp.expect_eq((current_setting('TimeZone') <> 'America/Phoenix')::text,
    'true', 'M1 the session zone is put back after rendering');
END;
$$;

-- ---------------------------------------------------------------------------
-- N1 / N2. The exhibitor is told about the withdrawal (501 was withdrawn in C1)
-- ---------------------------------------------------------------------------
UPDATE public.trials SET name = 'Saturday Trial', date = '2026-10-10'
WHERE id = pg_temp.fid('201');

SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    public.send_waitlist_withdrawal_message_internal(pg_temp.fid('501'), pg_temp.fid('022')),
    'sent', 'N1 the withdrawal message is sent');
  PERFORM pg_temp.expect_eq(
    public.send_waitlist_withdrawal_message_internal(pg_temp.fid('502'), pg_temp.fid('022')),
    'not_withdrawn', 'N1 a row that is not withdrawn gets no withdrawal message');
  PERFORM pg_temp.expect_eq(
    (public.enqueue_waitlist_notification_event(pg_temp.fid('501'), 'withdrawn') IS NOT NULL)::text,
    'true', 'N2 a withdrawn email/push event is queued');
END;
$$;
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.enqueue_waitlist_notification_event('00000000-0000-0000-0000-000001001501', 'rescinded')$q$,
  '22023', 'N2 an unknown event type is still refused');
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT t.participant_id::text || ' | ' || m.sender_id::text || ' | ' || m.body
       FROM public.show_messages m
       JOIN public.show_message_threads t ON t.id = m.thread_id
      WHERE m.show_id = pg_temp.fid('101') AND m.body LIKE 'The club withdrew%'),
    pg_temp.fid('021')::text || ' | ' || pg_temp.fid('022')::text
      || ' | The club withdrew the spot offered for Dog401 in Class Waitlist (Saturday Trial · Sat, Oct 10, 2026). No payment is due, and the payment link no longer works.',
    'N1 to the exhibitor, from the secretary, naming dog, class and trial');
  PERFORM pg_temp.expect_eq(
    (SELECT e.event_type || ' ' || (e.offer_cycle_at = w.offered_at)::text || ' ' || e.status
       FROM public.waitlist_notification_events e
       JOIN public.waitlist_entries w ON w.id = e.waitlist_entry_id
      WHERE e.waitlist_entry_id = pg_temp.fid('501')),
    'withdrawn true pending', 'N2 the event is for the row''s offer cycle, pending delivery');
END;
$$;

-- ---------------------------------------------------------------------------
-- A1. Shape and ACL of the notification functions
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
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

ROLLBACK;
