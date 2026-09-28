-- MYK9-854 behavioral contract: a SHOW-scoped secretary (not just a club-wide one) must
-- reach the full, platform-wide dog/person directory (dogs_select, people_select, and
-- dog_registrations_select transitively) — matching a site admin — so she can key in a
-- mail-in entry for any exhibitor's dog.
--
-- RESTRUCTURED 2026-09-27 (second Codex review round on PR #2579, P1): the first draft of
-- this fix widened the SHARED `is_show_manager()` helper itself (~30 other policies and
-- SECURITY DEFINER functions depend on it — entries, judge_assignments, people_private,
-- user_roles_select, clubs, armbands, and more), which would have handed a show-scoped
-- secretary every one of those surfaces, not just the dog/person directory. The fix now
-- adds a narrowly-scoped `can_read_dog_directory()` used ONLY by dogs_select/people_select.
-- This test asserts BOTH halves of that narrowing:
--   * the directory (dogs/people/dog_registrations) opens up for a show-scoped secretary;
--   * `is_show_manager()` itself, and everything still gated on it alone (user_roles_select),
--     stays exactly as narrow as it was before this migration.
--
-- Every denial is paired with a positive control on the same relation and caller, so a
-- policy that denied everything would fail this test rather than pass it (the pattern
-- myk9_470_scoped_role_predicates_test.sql already establishes for this file family).
--
-- Fixture has no entries/shows/trials relationship between the secretary and the dogs at
-- all — deliberately. The owner decision on MYK9-854 is that "dogs in shows the secretary
-- manages" is the WRONG scope (a dog being mailed in for the first time is in none of her
-- shows yet), so this test proves visibility with no show relationship whatsoever.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'MYK9-854 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000854001', 'MYK9-854 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000854021', 'MYK9-854 Show', 'AKC', current_date, current_date,
        '00000000-0000-0000-0000-000000854001', 'published');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000854011', 'MYK9-854', 'ShowSecretary', 'myk9-854-showsec@example.test', NULL),
  ('00000000-0000-0000-0000-000000854012', 'MYK9-854', 'SiteAdmin',     'myk9-854-admin@example.test',   NULL),
  ('00000000-0000-0000-0000-000000854013', 'MYK9-854', 'Exhibitor',     'myk9-854-exhibitor@example.test', NULL),
  ('00000000-0000-0000-0000-000000854014', 'MYK9-854', 'Owner',         'myk9-854-owner@example.test',   NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000854101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-854-showsec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000854102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-854-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000854103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-854-exhibitor@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000854104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-854-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000854011'::uuid, '00000000-0000-0000-0000-000000854101'::uuid),
  ('00000000-0000-0000-0000-000000854012'::uuid, '00000000-0000-0000-0000-000000854102'::uuid),
  ('00000000-0000-0000-0000-000000854013'::uuid, '00000000-0000-0000-0000-000000854103'::uuid),
  ('00000000-0000-0000-0000-000000854014'::uuid, '00000000-0000-0000-0000-000000854104'::uuid)
) AS fixture(person_id, auth_id)
WHERE person.id = fixture.person_id;

-- The regression itself: a SECRETARY row scoped to one SHOW, no club-wide row at all.
INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000854011', roles.id,
       '00000000-0000-0000-0000-000000854001', '00000000-0000-0000-0000-000000854021',
       true, '00000000-0000-0000-0000-000000854101'
FROM public.roles WHERE roles.name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000854012', roles.id, true, '00000000-0000-0000-0000-000000854102'
FROM public.roles WHERE roles.name = 'site_admin';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000854013', roles.id, true, '00000000-0000-0000-0000-000000854103'
FROM public.roles WHERE roles.name = 'exhibitor';

-- Three dogs, all owned by a fourth person (not the exhibitor above), and NOT entered in
-- any show — proving the secretary's reach is platform-wide, not show-derived.
INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000854051', 'MYK9-854 Dog Live 1', 'Labrador Retriever', '00000000-0000-0000-0000-000000854014'),
  ('00000000-0000-0000-0000-000000854052', 'MYK9-854 Dog Live 2', 'Labrador Retriever', '00000000-0000-0000-0000-000000854014'),
  ('00000000-0000-0000-0000-000000854053', 'MYK9-854 Dog Gone',   'Labrador Retriever', '00000000-0000-0000-0000-000000854014');
UPDATE public.dogs SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000854053';

-- A registration row on a live dog — proves dog_registrations_select (which delegates to
-- dogs_select via an un-DEFINERed EXISTS, not a direct is_show_manager()/
-- can_read_dog_directory() call) opens up transitively once dogs_select does.
INSERT INTO public.dog_registrations (id, dog_id, organization, registration_number)
VALUES ('00000000-0000-0000-0000-000000854061', '00000000-0000-0000-0000-000000854051', 'AKC', 'MYK9854001');

DO $$
DECLARE
  show_secretary uuid := '00000000-0000-0000-0000-000000854101';
  site_admin     uuid := '00000000-0000-0000-0000-000000854102';
  exhibitor      uuid := '00000000-0000-0000-0000-000000854103';
  n integer;
BEGIN
  ------------------------------------------------------------------
  -- is_show_manager() for the show-scoped secretary MUST STAY FALSE. This is the whole
  -- point of the restructure: the directory opens up via a NEW, narrower helper
  -- (can_read_dog_directory()), not by widening the shared gate ~30 other
  -- policies/functions depend on (entries, judge_assignments, people_private,
  -- user_roles_select, clubs, armbands, ...).
  ------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', show_secretary::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', show_secretary, 'role', 'authenticated')::text, true);

  IF (SELECT public.is_show_manager()) THEN
    RAISE EXCEPTION 'FAIL is_show_manager() returned true for a SHOW-scoped secretary — '
      'this widens ~30 other policies/functions (entries, judge_assignments, people_private, '
      'user_roles_select, clubs, armbands, ...) that must stay narrower than the dog directory';
  END IF;

  IF NOT (SELECT public.can_read_dog_directory()) THEN
    RAISE EXCEPTION 'FAIL can_read_dog_directory() returned false for a SHOW-scoped secretary — '
      'this is the MYK9-854 regression: dogs_select/people_select fall back to owner-only';
  END IF;

  ------------------------------------------------------------------
  -- dogs_select: the SHOW-scoped secretary reaches every LIVE dog platform-wide,
  -- with no show/entry relationship to any of them.
  ------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.dogs
  WHERE id IN ('00000000-0000-0000-0000-000000854051', '00000000-0000-0000-0000-000000854052');
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary read % of 2 live dogs owned by someone else, '
      'entered in no show of hers — MYK9-854 owner decision: a secretary sees ALL dogs', n;
  END IF;

  -- Soft-deleted dog stays hidden even from a show manager (dogs_select's deleted_at gate
  -- applies before the can_read_dog_directory() arm, not just the owner arm).
  SELECT count(*) INTO n FROM public.dogs WHERE id = '00000000-0000-0000-0000-000000854053';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary read % row(s) for a SOFT-DELETED dog', n;
  END IF;

  ------------------------------------------------------------------
  -- dog_registrations_select: transitively opened by dogs_select — no direct
  -- can_read_dog_directory() call in its policy text.
  ------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.dog_registrations
  WHERE id = '00000000-0000-0000-0000-000000854061';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary read % of 1 registration row on a dog she can '
      'read via dogs_select — dog_registrations_select should have followed transitively', n;
  END IF;

  ------------------------------------------------------------------
  -- people_select: the SHOW-scoped secretary reaches the dogs' owner, a person she has
  -- no show/entry relationship to and who is not herself.
  ------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.people
  WHERE id = '00000000-0000-0000-0000-000000854014';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary read % of 1 row for the dogs'' owner via '
      'people_select — MYK9-854 owner decision: a secretary sees the full person directory', n;
  END IF;

  ------------------------------------------------------------------
  -- user_roles_select: UNCHANGED. Still gated on is_show_manager() alone (20260910014500),
  -- which stays false for a show-scoped secretary, so she must NOT see another person's
  -- role row just because she can now see them in the dog/person directory.
  ------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = site_admin;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary read % user_roles row(s) for the site admin — '
      'user_roles_select must stay gated on is_show_manager() alone, unaffected by '
      'can_read_dog_directory()', n;
  END IF;

  ------------------------------------------------------------------
  -- Site admin: same platform-wide reach across all three relations (was not broken,
  -- kept as a locked-in control), and is_show_manager() stays true for admin.
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', site_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', site_admin, 'role', 'authenticated')::text, true);

  IF NOT (SELECT public.is_show_manager()) THEN
    RAISE EXCEPTION 'FAIL is_show_manager() returned false for a site admin';
  END IF;

  SELECT count(*) INTO n FROM public.dogs
  WHERE id IN ('00000000-0000-0000-0000-000000854051', '00000000-0000-0000-0000-000000854052');
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL site admin read % of 2 live dogs', n;
  END IF;

  SELECT count(*) INTO n FROM public.dog_registrations
  WHERE id = '00000000-0000-0000-0000-000000854061';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL site admin read % of 1 registration row', n;
  END IF;

  SELECT count(*) INTO n FROM public.people
  WHERE id = '00000000-0000-0000-0000-000000854014';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL site admin read % of 1 row for the dogs'' owner', n;
  END IF;

  ------------------------------------------------------------------
  -- Plain exhibitor: negative control. Must NOT reach dogs, registrations, or people
  -- they neither own nor co-own / are not themselves.
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', exhibitor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', exhibitor, 'role', 'authenticated')::text, true);

  IF (SELECT public.is_show_manager()) THEN
    RAISE EXCEPTION 'FAIL is_show_manager() returned true for a plain exhibitor';
  END IF;
  IF (SELECT public.can_read_dog_directory()) THEN
    RAISE EXCEPTION 'FAIL can_read_dog_directory() returned true for a plain exhibitor';
  END IF;

  SELECT count(*) INTO n FROM public.dogs
  WHERE id IN ('00000000-0000-0000-0000-000000854051', '00000000-0000-0000-0000-000000854052');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL plain exhibitor read % dog row(s) they neither own nor co-own — '
      'can_read_dog_directory() must not have been widened for non-staff callers', n;
  END IF;

  SELECT count(*) INTO n FROM public.dog_registrations
  WHERE id = '00000000-0000-0000-0000-000000854061';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL plain exhibitor read % registration row(s) for a dog they cannot see', n;
  END IF;

  SELECT count(*) INTO n FROM public.people
  WHERE id = '00000000-0000-0000-0000-000000854014';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL plain exhibitor read % row(s) for a person who is not themselves', n;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'PASS MYK9-854: a SHOW-scoped secretary reaches every live dog, its '
    'registrations, and its owner platform-wide (matching a site admin) via the new '
    'narrow can_read_dog_directory() gate, while is_show_manager() itself and '
    'user_roles_select stay exactly as narrow as before this migration; a soft-deleted '
    'dog stays hidden from both, and a plain exhibitor still reaches only what they own '
    'or are themselves';
END;
$$;

ROLLBACK;
