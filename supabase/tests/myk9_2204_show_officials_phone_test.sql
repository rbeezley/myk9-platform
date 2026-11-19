-- MYK9-2204: get_show_officials returns the secretary's and chairman's current phone only to a
-- caller who can manage the show. anon and a signed-in non-manager get NULL; a steward's phone is
-- never returned, not even to a manager.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000220401', 'Official Phone Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000220403',
  'Official Phone Show',
  'AKC',
  current_date,
  current_date,
  '00000000-0000-0000-0000-000000220401',
  'published'
);

INSERT INTO public.people (id, first_name, last_name, phone, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000220411', 'Phone', 'Secretary', '9185550011', '00000000-0000-0000-0000-000000220101'),
  ('00000000-0000-0000-0000-000000220412', 'Phone', 'Chair', '9185550012', '00000000-0000-0000-0000-000000220102'),
  ('00000000-0000-0000-0000-000000220413', 'Phone', 'Steward', '9185550013', '00000000-0000-0000-0000-000000220103'),
  ('00000000-0000-0000-0000-000000220414', 'Phone', 'Bystander', '9185550014', '00000000-0000-0000-0000-000000220104');

-- The Secretary manages the show through a club appointment; naming alone grants nothing.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000220411', r.id,
       '00000000-0000-0000-0000-000000220401', true,
       '00000000-0000-0000-0000-000000220101'
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.show_officials (show_id, person_id, role)
VALUES
  ('00000000-0000-0000-0000-000000220403', '00000000-0000-0000-0000-000000220411', 'secretary'),
  ('00000000-0000-0000-0000-000000220403', '00000000-0000-0000-0000-000000220412', 'chairman'),
  ('00000000-0000-0000-0000-000000220403', '00000000-0000-0000-0000-000000220413', 'steward');

-- 1. anon gets the officials but no phone.
SET LOCAL ROLE anon;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_show_officials('00000000-0000-0000-0000-000000220403')) <> 3 THEN
    RAISE EXCEPTION 'FAIL anon should still read the three named officials';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_show_officials('00000000-0000-0000-0000-000000220403') o
    WHERE o.phone IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL anon received an official phone';
  END IF;

  RAISE NOTICE 'PASS anon gets a NULL phone for every official';
END;
$$;

RESET ROLE;

-- 2. A signed-in user who does not manage the show gets no phone.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220104', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000220104', 'role', 'authenticated')::text,
  true
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.get_show_officials('00000000-0000-0000-0000-000000220403') o
    WHERE o.phone IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL a non-manager received an official phone';
  END IF;

  RAISE NOTICE 'PASS a signed-in non-manager gets a NULL phone';
END;
$$;

RESET ROLE;

-- 3. The club secretary, who manages the show, gets the secretary and chairman phones, never the steward's.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220101', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000220101', 'role', 'authenticated')::text,
  true
);

DO $$
DECLARE
  show constant uuid := '00000000-0000-0000-0000-000000220403';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.get_show_officials(show) o WHERE o.role = 'secretary' AND o.phone = '9185550011'
  ) THEN
    RAISE EXCEPTION 'FAIL a manager did not receive the secretary phone';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.get_show_officials(show) o WHERE o.role = 'chairman' AND o.phone = '9185550012'
  ) THEN
    RAISE EXCEPTION 'FAIL a manager did not receive the chairman phone';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_show_officials(show) o WHERE o.role = 'steward' AND o.phone IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL a steward phone was returned to a manager';
  END IF;

  RAISE NOTICE 'PASS a manager gets the secretary and chairman phone, never a steward''s';
END;
$$;

RESET ROLE;

-- 4. The phone is read live: clearing it on the person clears it for the manager.
UPDATE public.people SET phone = NULL WHERE id = '00000000-0000-0000-0000-000000220411';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220101', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000220101', 'role', 'authenticated')::text,
  true
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.get_show_officials('00000000-0000-0000-0000-000000220403') o
    WHERE o.role = 'secretary' AND o.phone IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL a cleared secretary phone still came back';
  END IF;

  RAISE NOTICE 'PASS a cleared phone is returned as NULL';
END;
$$;

RESET ROLE;

-- 5. Officials come back in assignment order, so the first row of a role is the first-named
--    official the premium prints, whatever order the rows were inserted in.
INSERT INTO public.show_officials (show_id, person_id, role, created_at)
VALUES
  ('00000000-0000-0000-0000-000000220403', '00000000-0000-0000-0000-000000220414', 'secretary', now() + interval '1 day');
UPDATE public.show_officials SET created_at = now() - interval '1 day'
WHERE show_id = '00000000-0000-0000-0000-000000220403'
  AND person_id = '00000000-0000-0000-0000-000000220411';

DO $$
DECLARE
  first_secretary uuid;
BEGIN
  SELECT o.user_id INTO first_secretary
  FROM public.get_show_officials('00000000-0000-0000-0000-000000220403') o
  WHERE o.role = 'secretary' LIMIT 1;
  IF first_secretary IS DISTINCT FROM '00000000-0000-0000-0000-000000220411'::uuid THEN
    RAISE EXCEPTION 'FAIL the first row of a role is not the earliest-assigned official';
  END IF;

  RAISE NOTICE 'PASS officials come back earliest-assigned first';
END;
$$;

ROLLBACK;
