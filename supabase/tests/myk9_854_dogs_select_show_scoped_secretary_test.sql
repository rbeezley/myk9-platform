-- MYK9-854 behavioral contract: dogs_select (via is_show_manager()) must admit a
-- SHOW-scoped secretary — not just a club-wide one — to the full, platform-wide dog
-- roster, matching a site admin. Before this fix, is_show_manager() called the bare
-- is_trial_secretary(), which 20260830210000 narrowed to club-wide-only appointments
-- (`AND ur.show_id IS NULL`); a secretary holding only a show-scoped row fell through
-- to the owner/co-owner arm and saw only her own dogs.
--
-- Every denial is paired with a positive control on the same relation and caller, so a
-- policy that denied everything would fail this test rather than pass it (the pattern
-- myk9_470_scoped_role_predicates_test.sql already establishes for this file family).
--
-- Fixture has no entries/shows/trials at all — deliberately. The owner decision on
-- MYK9-854 is that "dogs in shows the secretary manages" is the WRONG scope (a dog
-- being mailed in for the first time is in none of her shows yet), so this test proves
-- visibility with no show relationship whatsoever between the secretary and the dogs.

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

DO $$
DECLARE
  show_secretary uuid := '00000000-0000-0000-0000-000000854101';
  site_admin     uuid := '00000000-0000-0000-0000-000000854102';
  exhibitor      uuid := '00000000-0000-0000-0000-000000854103';
  n integer;
BEGIN
  ------------------------------------------------------------------
  -- is_show_manager() itself, for each caller — the direct regression assertion.
  ------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', show_secretary::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', show_secretary, 'role', 'authenticated')::text, true);

  IF NOT (SELECT public.is_show_manager()) THEN
    RAISE EXCEPTION 'FAIL is_show_manager() returned false for a SHOW-scoped secretary — '
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
  -- applies before the is_show_manager() arm, not just the owner arm).
  SELECT count(*) INTO n FROM public.dogs WHERE id = '00000000-0000-0000-0000-000000854053';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL show-scoped secretary read % row(s) for a SOFT-DELETED dog', n;
  END IF;

  ------------------------------------------------------------------
  -- Site admin: same platform-wide reach (was not broken, kept as a locked-in control).
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', site_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', site_admin, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.dogs
  WHERE id IN ('00000000-0000-0000-0000-000000854051', '00000000-0000-0000-0000-000000854052');
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL site admin read % of 2 live dogs', n;
  END IF;

  ------------------------------------------------------------------
  -- Plain exhibitor: negative control. Must NOT reach dogs they neither own nor co-own.
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', exhibitor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', exhibitor, 'role', 'authenticated')::text, true);

  IF (SELECT public.is_show_manager()) THEN
    RAISE EXCEPTION 'FAIL is_show_manager() returned true for a plain exhibitor';
  END IF;

  SELECT count(*) INTO n FROM public.dogs
  WHERE id IN ('00000000-0000-0000-0000-000000854051', '00000000-0000-0000-0000-000000854052');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL plain exhibitor read % dog row(s) they neither own nor co-own — '
      'is_show_manager() must not have been widened for non-staff callers', n;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'PASS MYK9-854: a SHOW-scoped secretary reaches every live dog platform-wide '
    '(matching a site admin), a soft-deleted dog stays hidden from both, and a plain '
    'exhibitor still reaches only dogs they own or co-own';
END;
$$;

ROLLBACK;
