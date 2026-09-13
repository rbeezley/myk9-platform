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
  ('00000000-0000-0000-0000-000000470013', 'MYK9-470', 'Owner',       'myk9-470-owner@example.test', NULL),
  -- SHOW-scoped secretary of club B's show, as opposed to the club-scoped secretaries above.
  ('00000000-0000-0000-0000-000000470014', 'MYK9-470', 'ShowScoped',  'myk9-470-showscoped@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000470101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-470-sec-a@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000470102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-470-sec-b@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000470103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-470-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000470104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-470-showscoped@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000470011'::uuid, '00000000-0000-0000-0000-000000470101'::uuid),
  ('00000000-0000-0000-0000-000000470012'::uuid, '00000000-0000-0000-0000-000000470102'::uuid),
  ('00000000-0000-0000-0000-000000470013'::uuid, '00000000-0000-0000-0000-000000470103'::uuid),
  ('00000000-0000-0000-0000-000000470014'::uuid, '00000000-0000-0000-0000-000000470104'::uuid)
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

-- A SHOW-scoped secretary row for club B's show. Codex review of 7736accbb claimed
-- manageable_show_ids() admits this caller, widening offline_scoring/nationals beyond the
-- original role set. It does not: is_trial_secretary() carries `AND ur.show_id IS NULL`, so a
-- show-scoped row satisfies neither the old bare is_trial_secretary() nor the new
-- is_trial_secretary(s.club_id). Asserted below rather than argued.
INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000470014', roles.id, '00000000-0000-0000-0000-000000470002',
       '00000000-0000-0000-0000-000000470022', true, '00000000-0000-0000-0000-000000470104'
FROM public.roles WHERE roles.name = 'secretary';

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
  ('00000000-0000-0000-0000-000000470052', 'MYK9-470 Dog B', 'Labrador Retriever', '00000000-0000-0000-0000-000000470013'),
  -- MYK9-475: a SOFT-DELETED dog, same owner, entered in club A's show. It is reachable by both
  -- the owner arm and the secretary arm, so it tests the deleted_at gate on each of them.
  ('00000000-0000-0000-0000-000000470053', 'MYK9-470 Dog Gone', 'Labrador Retriever', '00000000-0000-0000-0000-000000470013');
UPDATE public.dogs SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000470053';

-- trg_entries_require_dog_registration (20260828210000) refuses an entry whose dog holds no
-- registration for the trial's registry. Both shows here are AKC, and this test is about policy
-- scope rather than registration rules, so give each dog an AKC number — the same idiom
-- anon_tv_entry_soft_delete_test.sql uses.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d.id::text), 1, 8)), true
FROM public.dogs d
WHERE d.id IN (
  '00000000-0000-0000-0000-000000470051',
  '00000000-0000-0000-0000-000000470052',
  '00000000-0000-0000-0000-000000470053'
)
AND NOT EXISTS (
  SELECT 1 FROM public.dog_registrations r WHERE r.dog_id = d.id
);

INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, entry_status)
VALUES
  ('00000000-0000-0000-0000-000000470061', '00000000-0000-0000-0000-000000470051', '00000000-0000-0000-0000-000000470041', '00000000-0000-0000-0000-000000470021', '00000000-0000-0000-0000-000000470031', 'confirmed'),
  ('00000000-0000-0000-0000-000000470062', '00000000-0000-0000-0000-000000470052', '00000000-0000-0000-0000-000000470042', '00000000-0000-0000-0000-000000470022', '00000000-0000-0000-0000-000000470032', 'confirmed'),
  ('00000000-0000-0000-0000-000000470063', '00000000-0000-0000-0000-000000470053', '00000000-0000-0000-0000-000000470041', '00000000-0000-0000-0000-000000470021', '00000000-0000-0000-0000-000000470031', 'confirmed');

INSERT INTO public.vaccinations (id, dog_id, vaccine_name, date_administered)
VALUES
  ('00000000-0000-0000-0000-000000470071', '00000000-0000-0000-0000-000000470051', 'Rabies', current_date),
  ('00000000-0000-0000-0000-000000470072', '00000000-0000-0000-0000-000000470052', 'Rabies', current_date),
  ('00000000-0000-0000-0000-000000470073', '00000000-0000-0000-0000-000000470053', 'Rabies', current_date);

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
  dog_gone uuid := '00000000-0000-0000-0000-000000470053';
  show_a uuid := '00000000-0000-0000-0000-000000470021';
  show_b uuid := '00000000-0000-0000-0000-000000470022';
  entry_b uuid := '00000000-0000-0000-0000-000000470062';
  show_scoped uuid := '00000000-0000-0000-0000-000000470104';
  n integer;
BEGIN
  ------------------------------------------------------------------
  -- Policy inventory: a scoped policy is worthless beside a permissive sibling
  ------------------------------------------------------------------
  -- Postgres ORs permissive policies, so one leftover `USING (true)` SELECT policy would make
  -- every scoped predicate in migration 20260912171500 decorative. Codex review of that
  -- migration raised exactly this against vaccinations_secretary_select (mig 187) and
  -- nationals_*_select (migs 006/023). Both were already dropped by later migrations
  -- (20260728130000 and 20260725150000 respectively) and neither exists on the applied
  -- database — but "it is not there today" is not a guard, so pin the counts.
  SELECT count(*) INTO n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  WHERE c.relname = 'vaccinations' AND p.polcmd = 'r';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL vaccinations has % SELECT policies, want exactly 1 — a second '
      'permissive policy ORs with vaccinations_select and undoes its scoping', n;
  END IF;

  SELECT count(*) INTO n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  WHERE c.relname IN ('nationals_scores', 'nationals_rankings', 'nationals_advancement')
    AND p.polcmd IN ('r', '*');
  IF n <> 3 THEN
    RAISE EXCEPTION 'FAIL the three nationals_* tables expose % read-capable policies, want 3 '
      '(one FOR ALL each) — a leftover USING (true) SELECT policy would negate the scoping', n;
  END IF;

  SELECT count(*) INTO n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  WHERE c.relname = 'result_submissions' AND p.polcmd = 'r';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL result_submissions has % SELECT policies, want exactly 1', n;
  END IF;

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

  -- MYK9-475: dog_gone IS entered in club A's show, so the secretary arm reaches it on show
  -- scope alone. The dog is soft-deleted, and dogs_select hides a soft-deleted dog from every
  -- caller, so its vaccinations must be hidden too. The assertion directly above is the
  -- positive control for this arm.
  SELECT count(*) INTO n FROM public.vaccinations WHERE dog_id = dog_gone;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL club A secretary read % vaccination row(s) for a SOFT-DELETED dog '
      'entered in their own show — the deleted_at gate must cover the secretary arm too', n;
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
  -- The SHOW-scoped secretary: must reach nothing
  ------------------------------------------------------------------
  -- Codex review of 7736accbb argued manageable_show_ids() admits a show-scoped secretary and
  -- therefore WIDENS offline_scoring/nationals past the original role set. It does not:
  -- is_trial_secretary() carries `AND ur.show_id IS NULL`, so a show-scoped row satisfied
  -- neither the old bare is_trial_secretary() nor the new is_trial_secretary(s.club_id). This
  -- caller holds ONLY a show-scoped secretary row on club B's show, so if the review were right
  -- it would reach club B's rows here. Settled by execution rather than by reading SQL.
  PERFORM set_config('request.jwt.claim.sub', show_scoped::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', show_scoped, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.manageable_show_ids();
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL manageable_show_ids() returned % shows for a SHOW-scoped secretary — '
      'the migration would then widen offline_scoring/nationals past their original role set', n;
  END IF;
  SELECT count(*) INTO n FROM public.trial_secretary_show_ids();
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL trial_secretary_show_ids() returned % shows for a SHOW-scoped secretary', n;
  END IF;
  SELECT count(*) INTO n FROM public.nationals_scores WHERE entry_id = entry_b;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary read % nationals_scores row(s)', n;
  END IF;
  SELECT count(*) INTO n FROM public.result_submissions WHERE show_id = show_b;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary read % result_submissions row(s)', n;
  END IF;
  SELECT count(*) INTO n FROM public.vaccinations WHERE dog_id = dog_b;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary read % vaccination row(s)', n;
  END IF;
  UPDATE public.offline_scoring SET resolution = 'myk9-470-showscoped' WHERE entry_id = entry_b;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary UPDATEd offline_scoring';
  END IF;

  ------------------------------------------------------------------
  -- The dog owner: unchanged by this migration
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', owner::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.vaccinations WHERE dog_id IN (dog_a, dog_b);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL owner lost their own dogs'' vaccinations (got %, want 2)', n;
  END IF;

  -- MYK9-475: and the owner arm is gated the same way. dogs_select denies a soft-deleted dog to
  -- EVERY caller including its owner, so the owner arm must not be the one exception. The
  -- 2-row assertion directly above is the positive control.
  SELECT count(*) INTO n FROM public.vaccinations WHERE dog_id = dog_gone;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL owner read % vaccination row(s) for their own SOFT-DELETED dog', n;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'PASS MYK9-470/475 scoped role predicates: a club secretary reaches only their own club''s vaccinations, result submissions, nationals scores and offline scoring; a soft-deleted dog''s vaccinations are hidden from BOTH the secretary and the owner arm; and the dog owner keeps both of their live dogs';
END;
$$;

ROLLBACK;
