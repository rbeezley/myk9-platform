-- MYK9-470 / SA-2026-09-12-02 behavioral contract: policies that used the argument-less
-- is_club_admin() / is_trial_secretary() ("any club") are now scoped to the caller's own shows.
--
-- TWO clubs with a secretary each is the whole point of the fixture: a single-club fixture
-- cannot tell "scoped correctly" from "still platform-wide", because every row would belong to
-- the caller either way. Club A's secretary is the negative case for club B's rows.
--
-- Every denial is paired with a POSITIVE control on the same relation and the same caller, so a
-- policy that denied everything fails this test rather than passing it.
--
-- All fixtures roll back. None of these tables consumes a sequence, so the rollback is complete
-- (unlike ringside_containment_test.sql, whose nextval() survives ROLLBACK).

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'MYK9-470 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000470001', 'MYK9-470 Club A'),
  ('00000000-0000-0000-0000-000000470002', 'MYK9-470 Club B');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000470011', 'MYK9-470', 'Secretary A', 'myk9-470-sec-a@example.test', NULL),
  ('00000000-0000-0000-0000-000000470012', 'MYK9-470', 'Secretary B', 'myk9-470-sec-b@example.test', NULL),
  ('00000000-0000-0000-0000-000000470013', 'MYK9-470', 'Owner',       'myk9-470-owner@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000470101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-470-sec-a@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000470102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-470-sec-b@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000470103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-470-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000470011'::uuid, '00000000-0000-0000-0000-000000470101'::uuid),
  ('00000000-0000-0000-0000-000000470012'::uuid, '00000000-0000-0000-0000-000000470102'::uuid),
  ('00000000-0000-0000-0000-000000470013'::uuid, '00000000-0000-0000-0000-000000470103'::uuid)
) AS fixture(person_id, auth_id)
WHERE person.id = fixture.person_id;

-- Club-scoped secretary appointments, one per club.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000470011', roles.id, '00000000-0000-0000-0000-000000470001', true, '00000000-0000-0000-0000-000000470101'
FROM public.roles WHERE roles.name = 'secretary';
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000470012', roles.id, '00000000-0000-0000-0000-000000470002', true, '00000000-0000-0000-0000-000000470102'
FROM public.roles WHERE roles.name = 'secretary';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000470021', 'MYK9-470 Show A', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000000470001', 'published'),
  ('00000000-0000-0000-0000-000000470022', 'MYK9-470 Show B', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000000470002', 'published');

SET LOCAL ROLE service_role;

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000470031', '00000000-0000-0000-0000-000000470021', 'MYK9-470 Trial A', current_date),
  ('00000000-0000-0000-0000-000000470032', '00000000-0000-0000-0000-000000470022', 'MYK9-470 Trial B', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000470041', '00000000-0000-0000-0000-000000470031', 'MYK9-470 Class A'),
  ('00000000-0000-0000-0000-000000470042', '00000000-0000-0000-0000-000000470032', 'MYK9-470 Class B');

-- Two dogs, same owner. Dog A is entered in club A's show, dog B in club B's show. Neither is
-- entered in the other club's show, so each secretary has exactly one reachable dog.
INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000470051', 'MYK9-470 Dog A', 'Labrador Retriever', '00000000-0000-0000-0000-000000470013'),
  ('00000000-0000-0000-0000-000000470052', 'MYK9-470 Dog B', 'Labrador Retriever', '00000000-0000-0000-0000-000000470013');

-- trg_entries_require_dog_registration (20260828210000) refuses an entry whose dog holds no
-- registration for the trial's registry. Both shows here are AKC, and this test is about policy
-- scope rather than registration rules, so give each dog an AKC number — the same idiom
-- anon_tv_entry_soft_delete_test.sql uses.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d.id::text), 1, 8)), true
FROM public.dogs d
WHERE d.id IN (
  '00000000-0000-0000-0000-000000470051',
  '00000000-0000-0000-0000-000000470052'
)
AND NOT EXISTS (
  SELECT 1 FROM public.dog_registrations r WHERE r.dog_id = d.id
);

INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, entry_status)
VALUES
  ('00000000-0000-0000-0000-000000470061', '00000000-0000-0000-0000-000000470051', '00000000-0000-0000-0000-000000470041', '00000000-0000-0000-0000-000000470021', '00000000-0000-0000-0000-000000470031', 'confirmed'),
  ('00000000-0000-0000-0000-000000470062', '00000000-0000-0000-0000-000000470052', '00000000-0000-0000-0000-000000470042', '00000000-0000-0000-0000-000000470022', '00000000-0000-0000-0000-000000470032', 'confirmed');

INSERT INTO public.vaccinations (id, dog_id, vaccine_name, date_administered)
VALUES
  ('00000000-0000-0000-0000-000000470071', '00000000-0000-0000-0000-000000470051', 'Rabies', current_date),
  ('00000000-0000-0000-0000-000000470072', '00000000-0000-0000-0000-000000470052', 'Rabies', current_date);

INSERT INTO public.result_submissions (id, show_id, organization, sport_type, submitted_at, status)
VALUES
  ('00000000-0000-0000-0000-000000470081', '00000000-0000-0000-0000-000000470021', 'AKC', 'scent_work', now(), 'pending'),
  ('00000000-0000-0000-0000-000000470082', '00000000-0000-0000-0000-000000470022', 'AKC', 'scent_work', now(), 'pending');

INSERT INTO public.nationals_scores (id, entry_id, element_type, competition_day)
VALUES
  ('00000000-0000-0000-0000-000000470091', '00000000-0000-0000-0000-000000470061', 'container', 1),
  ('00000000-0000-0000-0000-000000470092', '00000000-0000-0000-0000-000000470062', 'container', 1);

INSERT INTO public.offline_scoring (id, entry_id, client_id, scoring_data)
VALUES
  ('00000000-0000-0000-0000-000000470095', '00000000-0000-0000-0000-000000470061', 'myk9-470-client', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000470096', '00000000-0000-0000-0000-000000470062', 'myk9-470-client', '{}'::jsonb);

RESET ROLE;

DO $$
DECLARE
  sec_a uuid := '00000000-0000-0000-0000-000000470101';
  owner uuid := '00000000-0000-0000-0000-000000470103';
  dog_a uuid := '00000000-0000-0000-0000-000000470051';
  dog_b uuid := '00000000-0000-0000-0000-000000470052';
  show_a uuid := '00000000-0000-0000-0000-000000470021';
  show_b uuid := '00000000-0000-0000-0000-000000470022';
  entry_b uuid := '00000000-0000-0000-0000-000000470062';
  n integer;
BEGIN
  ------------------------------------------------------------------
  -- Club A's secretary: own club yes, the other club no
  ------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', sec_a::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', sec_a, 'role', 'authenticated')::text, true);

  -- The helper itself: exactly one show, and it is club A's.
  SELECT count(*) INTO n FROM public.trial_secretary_show_ids();
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL trial_secretary_show_ids() returned % shows for club A''s secretary, want 1', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trial_secretary_show_ids() x WHERE x = show_a) THEN
    RAISE EXCEPTION 'FAIL trial_secretary_show_ids() did not include club A''s own show';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trial_secretary_show_ids() x WHERE x = show_b) THEN
    RAISE EXCEPTION 'FAIL trial_secretary_show_ids() leaked club B''s show to club A''s secretary';
  END IF;

  -- vaccinations: positive control FIRST.
  SELECT count(*) INTO n FROM public.vaccinations WHERE dog_id = dog_a;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL club A secretary lost vaccinations for a dog entered in their OWN show (got %, want 1)', n;
  END IF;
  SELECT count(*) INTO n FROM public.vaccinations WHERE dog_id = dog_b;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL club A secretary read % vaccination row(s) for a dog entered only in club B''s show', n;
  END IF;

  -- result_submissions
  SELECT count(*) INTO n FROM public.result_submissions WHERE show_id = show_a;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL club A secretary lost result_submissions for their OWN show (got %, want 1)', n;
  END IF;
  SELECT count(*) INTO n FROM public.result_submissions WHERE show_id = show_b;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL club A secretary read % result_submissions row(s) for club B''s show', n;
  END IF;

  -- nationals_scores (FOR ALL, so SELECT narrows too)
  SELECT count(*) INTO n FROM public.nationals_scores WHERE entry_id = '00000000-0000-0000-0000-000000470061';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL club A secretary lost nationals_scores for their OWN show (got %, want 1)', n;
  END IF;
  SELECT count(*) INTO n FROM public.nationals_scores WHERE entry_id = entry_b;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL club A secretary read % nationals_scores row(s) for club B''s entry', n;
  END IF;

  -- offline_scoring WRITE scope. The SELECT policy is is_real_account() and is untouched, so
  -- both rows stay readable; it is the UPDATE that must now refuse club B's row.
  UPDATE public.offline_scoring SET resolution = 'myk9-470-own' WHERE entry_id = '00000000-0000-0000-0000-000000470061';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL club A secretary could not UPDATE offline_scoring for their OWN show';
  END IF;
  UPDATE public.offline_scoring SET resolution = 'myk9-470-other' WHERE entry_id = entry_b;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL club A secretary UPDATEd offline_scoring for club B''s entry';
  END IF;

  -- And an INSERT against club B's entry must be refused outright.
  BEGIN
    INSERT INTO public.offline_scoring (entry_id, client_id, scoring_data)
    VALUES (entry_b, 'myk9-470-cross-tenant', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL club A secretary INSERTed offline_scoring against club B''s entry';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  ------------------------------------------------------------------
  -- The dog owner: unchanged by this migration
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.vaccinations WHERE dog_id IN (dog_a, dog_b);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL owner lost their own dogs'' vaccinations (got %, want 2)', n;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'PASS MYK9-470 scoped role predicates: a club secretary reaches only their own club''s vaccinations, result submissions, nationals scores and offline scoring, while the dog owner keeps both of theirs';
END;
$$;

ROLLBACK;
