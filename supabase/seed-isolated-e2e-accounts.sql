-- Local-only canonical account seed for the isolated Playwright lifecycle.
-- Auth users are created first through the local Auth admin API. This script
-- synchronizes database profiles and roles through the generated local DB URL,
-- avoiding any dependency on PostgREST grants or a shared Supabase project.

BEGIN;

WITH accounts(email, first_name, last_name) AS (
  VALUES
    ('e2e-exhibitor@test.myk9.com', 'Test', 'Exhibitor'),
    ('e2e-secretary@test.myk9.com', 'Test', 'Secretary'),
    ('e2e-judge@test.myk9.com', 'Test', 'Judge'),
    ('e2e-admin@test.myk9.com', 'Test', 'Admin')
)
UPDATE public.people AS person
SET
  auth_user_id = auth_user.id,
  first_name = account.first_name,
  last_name = account.last_name,
  email = account.email,
  deleted_at = NULL
FROM auth.users AS auth_user
JOIN accounts AS account ON lower(auth_user.email) = account.email
WHERE lower(person.email) = account.email;

WITH accounts(email, first_name, last_name) AS (
  VALUES
    ('e2e-exhibitor@test.myk9.com', 'Test', 'Exhibitor'),
    ('e2e-secretary@test.myk9.com', 'Test', 'Secretary'),
    ('e2e-judge@test.myk9.com', 'Test', 'Judge'),
    ('e2e-admin@test.myk9.com', 'Test', 'Admin')
)
INSERT INTO public.people (auth_user_id, first_name, last_name, email)
SELECT auth_user.id, account.first_name, account.last_name, account.email
FROM auth.users AS auth_user
JOIN accounts AS account ON lower(auth_user.email) = account.email
WHERE NOT EXISTS (
  SELECT 1
  FROM public.people AS person
  WHERE person.auth_user_id = auth_user.id
     OR lower(person.email) = account.email
);

DO $$
DECLARE
  account_count integer;
BEGIN
  SELECT count(*)
  INTO account_count
  FROM public.people
  WHERE lower(email) IN (
    'e2e-exhibitor@test.myk9.com',
    'e2e-secretary@test.myk9.com',
    'e2e-judge@test.myk9.com',
    'e2e-admin@test.myk9.com'
  )
    AND auth_user_id IS NOT NULL
    AND deleted_at IS NULL;

  IF account_count <> 4 THEN
    RAISE EXCEPTION
      'isolated account seed: expected 4 active profiles with auth ids, found %',
      account_count;
  END IF;
END
$$;

WITH desired(email, role_name) AS (
  VALUES
    ('e2e-exhibitor@test.myk9.com', 'exhibitor'),
    ('e2e-secretary@test.myk9.com', 'steward'),
    ('e2e-secretary@test.myk9.com', 'exhibitor'),
    ('e2e-judge@test.myk9.com', 'judge'),
    ('e2e-admin@test.myk9.com', 'site_admin'),
    ('e2e-admin@test.myk9.com', 'chairman'),
    ('e2e-admin@test.myk9.com', 'exhibitor')
)
UPDATE public.user_roles AS user_role
SET
  is_active = true,
  auth_user_id = person.auth_user_id,
  expires_at = NULL
FROM desired
JOIN public.people AS person ON lower(person.email) = desired.email
JOIN public.roles AS role ON role.name = desired.role_name
WHERE user_role.user_id = person.id
  AND user_role.role_id = role.id
  AND user_role.club_id IS NULL
  AND user_role.show_id IS NULL;

WITH desired(email, role_name) AS (
  VALUES
    ('e2e-exhibitor@test.myk9.com', 'exhibitor'),
    ('e2e-secretary@test.myk9.com', 'steward'),
    ('e2e-secretary@test.myk9.com', 'exhibitor'),
    ('e2e-judge@test.myk9.com', 'judge'),
    ('e2e-admin@test.myk9.com', 'site_admin'),
    ('e2e-admin@test.myk9.com', 'chairman'),
    ('e2e-admin@test.myk9.com', 'exhibitor')
)
INSERT INTO public.user_roles (
  user_id,
  role_id,
  club_id,
  show_id,
  is_active,
  auth_user_id,
  granted_at
)
SELECT
  person.id,
  role.id,
  NULL,
  NULL,
  true,
  person.auth_user_id,
  '2026-07-27 00:00:00+00'
FROM desired
JOIN public.people AS person ON lower(person.email) = desired.email
JOIN public.roles AS role ON role.name = desired.role_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles AS user_role
  WHERE user_role.user_id = person.id
    AND user_role.role_id = role.id
    AND user_role.club_id IS NULL
    AND user_role.show_id IS NULL
);

WITH desired(email, role_name) AS (
  VALUES
    ('e2e-secretary@test.myk9.com', 'secretary'),
    ('e2e-admin@test.myk9.com', 'secretary'),
    ('e2e-admin@test.myk9.com', 'club_admin')
),
demo_club AS (
  SELECT id
  FROM public.clubs
  WHERE id = 'dededede-0000-0000-0000-000000000001'
)
UPDATE public.user_roles AS user_role
SET
  is_active = true,
  auth_user_id = person.auth_user_id,
  expires_at = NULL
FROM desired
JOIN public.people AS person ON lower(person.email) = desired.email
JOIN public.roles AS role ON role.name = desired.role_name
CROSS JOIN demo_club
WHERE user_role.user_id = person.id
  AND user_role.role_id = role.id
  AND user_role.club_id = demo_club.id
  AND user_role.show_id IS NULL;

WITH desired(email, role_name) AS (
  VALUES
    ('e2e-secretary@test.myk9.com', 'secretary'),
    ('e2e-admin@test.myk9.com', 'secretary'),
    ('e2e-admin@test.myk9.com', 'club_admin')
),
demo_club AS (
  SELECT id
  FROM public.clubs
  WHERE id = 'dededede-0000-0000-0000-000000000001'
)
INSERT INTO public.user_roles (
  user_id,
  role_id,
  club_id,
  show_id,
  is_active,
  auth_user_id,
  granted_at
)
SELECT
  person.id,
  role.id,
  demo_club.id,
  NULL,
  true,
  person.auth_user_id,
  '2026-07-27 00:00:00+00'
FROM desired
JOIN public.people AS person ON lower(person.email) = desired.email
JOIN public.roles AS role ON role.name = desired.role_name
CROSS JOIN demo_club
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles AS user_role
  WHERE user_role.user_id = person.id
    AND user_role.role_id = role.id
    AND user_role.club_id = demo_club.id
    AND user_role.show_id IS NULL
);

COMMIT;
