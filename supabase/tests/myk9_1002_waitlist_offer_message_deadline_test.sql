-- MYK9-1002 (migration 20261005235100): the in-app wait list offer message
-- states the deadline in the Offer dialog's words, and a mail-in offer, which
-- never expires, states none.
--
-- Properties asserted here:
--   D1  An online offer in a trial with a zone (America/Chicago) reads
--       "You have 48 hours to pay (until Fri, Jul 17, 10:00 AM CDT)." and,
--       with a payment link, ends with that link.
--   D2  A trial whose zone is blank or unknown falls back to America/New_York
--       ("until Thu, Jul 16, 1:00 PM EDT"), and the no-link branch still
--       ends "Open My Entries to accept the offer before it expires."
--   D3  A MAIL-IN offer, even with offer_expires_at stamped on it, states no
--       hours, no clock time and no expiry: "The club is holding it for you
--       until they receive your payment. Pay the club directly and soon ..."
--   D4  The session TimeZone is put back after rendering.
--   A1  The function keeps SECURITY DEFINER, search_path '' and EXECUTE for
--       service_role only.
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

-- Fixture ids: 00000000-0000-0000-0000-000001002<nnn>.
CREATE FUNCTION pg_temp.fid(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000001002' || p_suffix)::uuid
$f$;

-- ---------------------------------------------------------------------------
-- Fixtures: club 001, show 101; trial 201 America/Chicago (class 301), trial
-- 202 with a blank zone (class 302), trial 203 with an unknown zone (class
-- 303). Exhibitor person 011 (auth 021) owns dogs 401-405; person 012 (auth
-- 022) is the sender.
--   501 dog 401  class 301  online   Jul 15 15:00Z + 48h         (D1)
--   502 dog 402  class 302  online   Jul 15 17:00Z + 24h, blank  (D2)
--   503 dog 403  class 303  online   Jul 15 17:00Z + 24h, unknown (D2)
--   504 dog 404  class 301  MAIL-IN  Jul 15 15:00Z + 48h         (D3)
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name) VALUES (pg_temp.fid('001'), 'MYK9-1002 Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (pg_temp.fid('011'), 'MYK9-1002', 'Exhibitor', 'myk9-1002-exh@example.test'),
  (pg_temp.fid('012'), 'MYK9-1002', 'Secretary', 'myk9-1002-sec@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT pg_temp.fid(v.auth_suffix), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', v.email, '', now(), now(), now(),
       '{}', '{}', false, false, false
FROM (VALUES
  ('021', 'myk9-1002-exh@example.test'),
  ('022', 'myk9-1002-sec@example.test')
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
VALUES (pg_temp.fid('101'), 'MYK9-1002 Show', 'AKC',
        current_date + 30, current_date + 30, 'draft', pg_temp.fid('001'));

INSERT INTO public.trials (id, show_id, name, date, timezone)
VALUES
  (pg_temp.fid('201'), pg_temp.fid('101'), 'Trial Chicago', current_date + 30, 'America/Chicago'),
  (pg_temp.fid('202'), pg_temp.fid('101'), 'Trial Blank', current_date + 30, ''),
  (pg_temp.fid('203'), pg_temp.fid('101'), 'Trial Unknown', current_date + 30, 'Not/AZone');

INSERT INTO public.classes (id, trial_id, name, status, status_source, max_entries, allow_waitlist)
VALUES
  (pg_temp.fid('301'), pg_temp.fid('201'), 'Class Chicago', 'upcoming', 'derived', 5, true),
  (pg_temp.fid('302'), pg_temp.fid('202'), 'Class Blank', 'upcoming', 'derived', 5, true),
  (pg_temp.fid('303'), pg_temp.fid('203'), 'Class Unknown', 'upcoming', 'derived', 5, true);

INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT pg_temp.fid((400 + n)::text), 'Dog' || (400 + n), 'Beagle', pg_temp.fid('011')
FROM generate_series(1, 4) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT pg_temp.fid((400 + n)::text), 'AKC', 'SW1002' || n, 'Dog ' || n || ' Formally'
FROM generate_series(1, 4) AS n;

INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position, status, joined_via,
  offered_at, offer_expires_at
)
SELECT pg_temp.fid(v.id), pg_temp.fid(v.class), ep.id, pg_temp.fid(v.dog), v.pos, 'offered',
       v.joined_via, v.offered_at, v.expires_at
FROM (VALUES
  ('501', '301', '401', 1, 'online',
   timestamptz '2026-07-15 15:00:00+00', timestamptz '2026-07-17 15:00:00+00'),
  ('502', '302', '402', 1, 'online',
   timestamptz '2026-07-15 17:00:00+00', timestamptz '2026-07-16 17:00:00+00'),
  ('503', '303', '403', 1, 'online',
   timestamptz '2026-07-15 17:00:00+00', timestamptz '2026-07-16 17:00:00+00'),
  ('504', '301', '404', 2, 'mail_in',
   timestamptz '2026-07-15 15:00:00+00', timestamptz '2026-07-17 15:00:00+00')
) AS v(id, class, dog, pos, joined_via, offered_at, expires_at)
JOIN public.exhibitor_profiles ep ON ep.auth_user_id = pg_temp.fid('021');

CREATE FUNCTION pg_temp.body(p_class_name text, p_dog text)
RETURNS text LANGUAGE sql AS $f$
  SELECT string_agg(m.body, ' || ') FROM public.show_messages m
  WHERE m.show_id = pg_temp.fid('101')
    AND m.body LIKE 'A spot opened for ' || p_dog || ' in ' || p_class_name || '.%'
$f$;

-- ---------------------------------------------------------------------------
-- Send every message as the edge/secretary paths do (service_role), from a
-- known session zone that is none of the trial zones.
-- ---------------------------------------------------------------------------
SET LOCAL TimeZone = 'UTC';
CREATE TEMP TABLE sent (k text, outcome text);
GRANT ALL ON sent TO service_role;
SET LOCAL ROLE service_role;
INSERT INTO sent VALUES
  ('501', public.send_waitlist_offer_message_internal(
     pg_temp.fid('501'), pg_temp.fid('022'), 'https://checkout.example.test/pay/1002')),
  ('502', public.send_waitlist_offer_message_internal(pg_temp.fid('502'), pg_temp.fid('022'), NULL)),
  ('503', public.send_waitlist_offer_message_internal(pg_temp.fid('503'), pg_temp.fid('022'), NULL)),
  ('504', public.send_waitlist_offer_message_internal(pg_temp.fid('504'), pg_temp.fid('022'), NULL));
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(k || '=' || outcome, ',' ORDER BY k) FROM sent),
    '501=sent,502=sent,503=sent,504=sent',
    'setup: every message sent');

  -- D1
  PERFORM pg_temp.expect_eq(
    pg_temp.body('Class Chicago', 'Dog401'),
    'A spot opened for Dog401 in Class Chicago. You have 48 hours to pay (until Fri, Jul 17, 10:00 AM CDT). You pay for this spot only if you claim it. Complete payment to claim it: https://checkout.example.test/pay/1002',
    'D1 an online offer states its hours and end time in the trial zone (Chicago), with the link');

  -- D2
  PERFORM pg_temp.expect_eq(
    pg_temp.body('Class Blank', 'Dog402'),
    'A spot opened for Dog402 in Class Blank. You have 24 hours to pay (until Thu, Jul 16, 1:00 PM EDT). You pay for this spot only if you claim it. Open My Entries to accept the offer before it expires.',
    'D2 a blank trial zone falls back to New York; the no-link branch still works');
  PERFORM pg_temp.expect_eq(
    pg_temp.body('Class Unknown', 'Dog403'),
    'A spot opened for Dog403 in Class Unknown. You have 24 hours to pay (until Thu, Jul 16, 1:00 PM EDT). You pay for this spot only if you claim it. Open My Entries to accept the offer before it expires.',
    'D2 an unknown trial zone falls back to New York');

  -- D3
  PERFORM pg_temp.expect_eq(
    pg_temp.body('Class Chicago', 'Dog404'),
    'A spot opened for Dog404 in Class Chicago. The club is holding it for you until they receive your payment. Pay the club directly and soon — they can release the spot if they don''t hear from you. You pay for this spot only if you claim it.',
    'D3 a mail-in offer states no deadline');
  PERFORM pg_temp.expect_eq(
    (SELECT (pg_temp.body('Class Chicago', 'Dog404') ~* '(hour|expire|CDT|EDT| PM| AM|offer ends)')::text),
    'false', 'D3 the mail-in message names no window, clock time, zone or expiry');

  -- D4
  PERFORM pg_temp.expect_eq(current_setting('TimeZone'), 'UTC',
    'D4 the session zone is put back after rendering');
END;
$$;

-- ---------------------------------------------------------------------------
-- A1. Shape and ACL unchanged
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text := 'public.send_waitlist_offer_message_internal(uuid,uuid,text)';
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
    'true search_path=""', 'A1 SECURITY DEFINER, empty search_path');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('service_role', v_fn, 'EXECUTE'),
    'false false true', 'A1 EXECUTE: service_role only');
END;
$$;

ROLLBACK;
