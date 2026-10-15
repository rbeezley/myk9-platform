-- MYK9-1151: an offline create merged onto an existing dog keeps its other
-- registrations when safe, and skips (silently) any that would collide.
-- All fixtures roll back.
BEGIN;
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000001151011', 'MYK9-1151', 'Owner', 'myk91151-owner@example.test');
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000001151101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk91151-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);
-- Dog D holds AKC SW1. Dog E (another dog) holds ASCA TAKEN. Dog F holds AKC SW2.
INSERT INTO public.dogs (id, name, call_name, owner_id)
VALUES ('00000000-0000-0000-0000-000001151201', 'D', 'D', '00000000-0000-0000-0000-000001151011'),
       ('00000000-0000-0000-0000-000001151202', 'E', 'E', '00000000-0000-0000-0000-000001151011'),
       ('00000000-0000-0000-0000-000001151203', 'F', 'F', '00000000-0000-0000-0000-000001151011'),
       ('00000000-0000-0000-0000-000001151204', 'G', 'G', '00000000-0000-0000-0000-000001151011'),
       ('00000000-0000-0000-0000-000001151205', 'H', 'H', '00000000-0000-0000-0000-000001151011');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, status)
VALUES ('00000000-0000-0000-0000-000001151201', 'AKC', 'MYK91151SW1', 'active'),
       ('00000000-0000-0000-0000-000001151202', 'ASCA', 'MYK91151TAKEN', 'active'),
       ('00000000-0000-0000-0000-000001151203', 'AKC', 'MYK91151SW2', 'active'),
       ('00000000-0000-0000-0000-000001151204', 'AKC', 'MYK91151SW3', 'active'),
       -- Dog H already holds a UKC row, seeded here so the same-org cases stand alone.
       ('00000000-0000-0000-0000-000001151205', 'AKC', 'MYK91151SW4', 'active'),
       ('00000000-0000-0000-0000-000001151205', 'UKC', 'MYK91151H1', 'active');
-- A club admin who is not a secretary, site admin or owner.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000001151012', 'MYK9-1151', 'ClubAdmin', 'myk91151-ca@example.test', NULL);
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000001151102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk91151-ca@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001151102' WHERE id = '00000000-0000-0000-0000-000001151012';
INSERT INTO public.clubs (id, name) VALUES ('00000000-0000-0000-0000-000001151301', 'MYK9-1151 Club');
INSERT INTO public.roles (name, description, is_system) VALUES ('club_admin', 'MYK9-1151 fixture', true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001151012', roles.id, '00000000-0000-0000-0000-000001151301', true, '00000000-0000-0000-0000-000001151102'
FROM public.roles WHERE roles.name = 'club_admin';
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001151101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000001151101","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- Sibling for a new organization (UKC U9) is inserted onto D.
DO $$
DECLARE v_id uuid;
BEGIN
 v_id := public.create_dog_with_registrations(
  '{"id":"00000000-0000-0000-0000-000001151301","owner_id":"00000000-0000-0000-0000-000001151011","call_name":"Device Dog"}',
  '[{"organization":"AKC","registration_number":"MYK91151SW1"},{"organization":"UKC","registration_number":"MYK91151U9","registered_name":"U9 Name","registration_date":"2026-09-23"}]');
 IF v_id <> '00000000-0000-0000-0000-000001151201' THEN
  RAISE EXCEPTION 'FAIL merge did not return dog D';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.dog_registrations WHERE dog_id = v_id AND organization = 'UKC' AND registration_number = 'MYK91151U9' AND registration_date = DATE '2026-09-23') THEN
  RAISE EXCEPTION 'FAIL sibling for a new organization was not inserted on D';
 END IF;
 IF EXISTS (SELECT 1 FROM public.dogs WHERE id = '00000000-0000-0000-0000-000001151301') THEN
  RAISE EXCEPTION 'FAIL merge created the device dog';
 END IF;
 RAISE NOTICE 'PASS new-organization sibling merged onto D';
END;
$$;

-- A sibling whose organization H already has (seeded above) is skipped, and
-- so is one spelled differently (normalization), while a new org still lands.
DO $$
DECLARE v_id uuid;
BEGIN
 v_id := public.create_dog_with_registrations(
  '{"id":"00000000-0000-0000-0000-000001151302","owner_id":"00000000-0000-0000-0000-000001151011","call_name":"Device Dog"}',
  '[{"organization":"AKC","registration_number":"MYK91151SW4"},{"organization":"UKC","registration_number":"MYK91151SAMEORG"},{"organization":"ukc","registration_number":"MYK91151LOWER"}]');
 IF v_id <> '00000000-0000-0000-0000-000001151205' THEN
  RAISE EXCEPTION 'FAIL same-org merge did not return dog H';
 END IF;
 IF EXISTS (SELECT 1 FROM public.dog_registrations WHERE registration_number IN ('MYK91151SAMEORG', 'MYK91151LOWER')) THEN
  RAISE EXCEPTION 'FAIL sibling for an organization H already has (any spelling) was inserted';
 END IF;
 RAISE NOTICE 'PASS same-organization and alternate-spelling siblings skipped';
END;
$$;

-- A sibling whose number belongs to another dog is skipped; the call still
-- returns F and the non-colliding sibling is kept.
DO $$
DECLARE v_id uuid;
BEGIN
 v_id := public.create_dog_with_registrations(
  '{"id":"00000000-0000-0000-0000-000001151303","owner_id":"00000000-0000-0000-0000-000001151011","call_name":"Device Dog"}',
  '[{"organization":"AKC","registration_number":"MYK91151SW2"},{"organization":"ASCA","registration_number":"MYK91151TAKEN"},{"organization":"UKC","registration_number":"MYK91151F9"}]');
 IF v_id <> '00000000-0000-0000-0000-000001151203' THEN
  RAISE EXCEPTION 'FAIL colliding-number merge did not return dog F';
 END IF;
 IF (SELECT count(*) FROM public.dog_registrations WHERE registration_number = 'MYK91151TAKEN') <> 1
   OR NOT EXISTS (SELECT 1 FROM public.dog_registrations WHERE dog_id = '00000000-0000-0000-0000-000001151202' AND registration_number = 'MYK91151TAKEN') THEN
  RAISE EXCEPTION 'FAIL a number held by another dog was touched';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.dog_registrations WHERE dog_id = v_id AND organization = 'UKC' AND registration_number = 'MYK91151F9') THEN
  RAISE EXCEPTION 'FAIL the non-colliding sibling was dropped with the colliding one';
 END IF;
 RAISE NOTICE 'PASS colliding-number sibling skipped, call returned F';
END;
$$;
-- A club admin who is not a secretary, site admin or owner merges onto another
-- owner's dog G: gets G back, and no sibling row is written.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001151102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000001151102","role":"authenticated"}', true);
DO $$
DECLARE v_id uuid;
BEGIN
 v_id := public.create_dog_with_registrations(
  '{"id":"00000000-0000-0000-0000-000001151304","owner_id":"00000000-0000-0000-0000-000001151012","call_name":"Device Dog"}',
  '[{"organization":"AKC","registration_number":"MYK91151SW3"},{"organization":"UKC","registration_number":"MYK91151G9"}]');
 IF v_id <> '00000000-0000-0000-0000-000001151204' THEN
  RAISE EXCEPTION 'FAIL club admin merge did not return dog G';
 END IF;
 RESET ROLE;
 IF EXISTS (SELECT 1 FROM public.dog_registrations WHERE registration_number = 'MYK91151G9') THEN
  RAISE EXCEPTION 'FAIL club admin wrote a sibling onto another owner''s dog';
 END IF;
 RAISE NOTICE 'PASS club admin merge returned G and wrote no sibling';
END;
$$;
-- The same club admin names G's real owner in the payload: the payload cannot
-- vouch for itself, so still no sibling is written.
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_id uuid;
BEGIN
 v_id := public.create_dog_with_registrations(
  '{"id":"00000000-0000-0000-0000-000001151305","owner_id":"00000000-0000-0000-0000-000001151011","call_name":"Device Dog"}',
  '[{"organization":"AKC","registration_number":"MYK91151SW3"},{"organization":"UKC","registration_number":"MYK91151G8"}]');
 IF v_id <> '00000000-0000-0000-0000-000001151204' THEN
  RAISE EXCEPTION 'FAIL club admin owner-spoof merge did not return dog G';
 END IF;
 RESET ROLE;
 IF EXISTS (SELECT 1 FROM public.dog_registrations WHERE registration_number = 'MYK91151G8') THEN
  RAISE EXCEPTION 'FAIL club admin naming the real owner wrote a sibling onto G';
 END IF;
 RAISE NOTICE 'PASS club admin naming the real owner still wrote no sibling';
END;
$$;
ROLLBACK;
