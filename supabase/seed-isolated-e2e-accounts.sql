-- Local-only canonical account seed for the isolated Playwright lifecycle.
-- Auth users are created first through the local Auth admin API. This script
-- synchronizes database profiles and roles through the generated local DB URL,
-- avoiding any dependency on PostgREST grants or a shared Supabase project.

BEGIN;

WITH accounts(email, first_name, last_name) AS (
  VALUES
    ('exhibitor@myk9t.com', 'Test', 'Exhibitor'),
    ('secretary@myk9t.com', 'Test', 'Secretary'),
    ('judge@myk9t.com', 'Test', 'Judge'),
    ('testadmin@myk9t.com', 'Test', 'Admin'),
    -- Optional club-admin-only account (MYK9-137). Every statement in this file
    -- joins auth.users or people, so where E2E_CLUB_ADMIN_PASSWORD is unset the
    -- Auth user does not exist and each one simply matches no rows. It is
    -- deliberately absent from the count assertion below, which guards the
    -- accounts a run cannot proceed without.
    ('clubadmin@myk9t.com', 'Test', 'Club Admin'),
    -- Chairman-only and second-exhibitor fixtures. Optional in the same sense as
    -- the club admin above: no Auth user, no matching rows, seed still completes.
    ('chairman@myk9t.com', 'Test', 'Chairman'),
    ('exhibitor2@myk9t.com', 'Second', 'Exhibitor')
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
    ('exhibitor@myk9t.com', 'Test', 'Exhibitor'),
    ('secretary@myk9t.com', 'Test', 'Secretary'),
    ('judge@myk9t.com', 'Test', 'Judge'),
    ('testadmin@myk9t.com', 'Test', 'Admin'),
    -- Optional club-admin-only account (MYK9-137). Every statement in this file
    -- joins auth.users or people, so where E2E_CLUB_ADMIN_PASSWORD is unset the
    -- Auth user does not exist and each one simply matches no rows. It is
    -- deliberately absent from the count assertion below, which guards the
    -- accounts a run cannot proceed without.
    ('clubadmin@myk9t.com', 'Test', 'Club Admin'),
    -- Chairman-only and second-exhibitor fixtures. Optional in the same sense as
    -- the club admin above: no Auth user, no matching rows, seed still completes.
    ('chairman@myk9t.com', 'Test', 'Chairman'),
    ('exhibitor2@myk9t.com', 'Second', 'Exhibitor')
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
    'exhibitor@myk9t.com',
    'secretary@myk9t.com',
    'judge@myk9t.com',
    'testadmin@myk9t.com'
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

-- Fresh Auth users receive an exhibitor profile through the auth hook, but it
-- starts with onboarding incomplete. Canonical E2E accounts represent returning
-- users, so keep their profile link current and bypass the first-run wizard.
INSERT INTO public.exhibitor_profiles (
  person_id,
  auth_user_id,
  onboarding_completed_at
)
SELECT
  person.id,
  person.auth_user_id,
  '2026-07-27 00:00:00+00'
FROM public.people AS person
WHERE lower(person.email) IN (
  'exhibitor@myk9t.com',
  'secretary@myk9t.com',
  'judge@myk9t.com',
  'testadmin@myk9t.com',
  -- Without this the club admin lands on the first-run onboarding wizard instead
  -- of the club surface it was created to exercise.
  'clubadmin@myk9t.com',
  'chairman@myk9t.com',
  'exhibitor2@myk9t.com'
)
  AND person.auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id)
DO UPDATE SET
  person_id = EXCLUDED.person_id,
  onboarding_completed_at = EXCLUDED.onboarding_completed_at,
  updated_at = '2026-07-27 00:00:00+00';

WITH desired(email, role_name) AS (
  VALUES
    ('exhibitor@myk9t.com', 'exhibitor'),
    ('secretary@myk9t.com', 'steward'),
    ('secretary@myk9t.com', 'exhibitor'),
    ('judge@myk9t.com', 'judge'),
    ('testadmin@myk9t.com', 'site_admin'),
    ('testadmin@myk9t.com', 'exhibitor'),
    ('exhibitor2@myk9t.com', 'exhibitor')
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
  -- Never reactivate onto a profile with no Auth identity: for the optional
  -- accounts a wiped auth.users leaves a stale people row behind, and the
  -- result is an active grant that can never be signed into (#1626).
  AND person.auth_user_id IS NOT NULL
  AND user_role.club_id IS NULL
  AND user_role.show_id IS NULL;

WITH desired(email, role_name) AS (
  VALUES
    ('exhibitor@myk9t.com', 'exhibitor'),
    ('secretary@myk9t.com', 'steward'),
    ('secretary@myk9t.com', 'exhibitor'),
    ('judge@myk9t.com', 'judge'),
    ('testadmin@myk9t.com', 'site_admin'),
    ('testadmin@myk9t.com', 'exhibitor'),
    ('exhibitor2@myk9t.com', 'exhibitor')
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
-- Same reason as the reactivate block above: person.auth_user_id is written
-- straight into the grant, so a stale profile with no Auth identity would insert
-- an ACTIVE role nobody can sign into (#1626). Only the optional accounts can
-- reach that state; the required four are covered by the count assertion.
WHERE person.auth_user_id IS NOT NULL
  AND NOT EXISTS (
  SELECT 1
  FROM public.user_roles AS user_role
  WHERE user_role.user_id = person.id
    AND user_role.role_id = role.id
    AND user_role.club_id IS NULL
    AND user_role.show_id IS NULL
);

WITH desired(email, role_name) AS (
  VALUES
    ('secretary@myk9t.com', 'secretary'),
    ('testadmin@myk9t.com', 'secretary'),
    ('testadmin@myk9t.com', 'club_admin'),
    -- chairman lives on its own account rather than on testadmin, for the same
    -- reason the club admin does: a fixture that also holds site_admin satisfies
    -- a role gate through the wrong branch, so an assertion written with it is
    -- vacuous whether or not the scoping it claims to test exists.
    ('chairman@myk9t.com', 'chairman'),
    -- CLUB-SCOPED ONLY, and absent from the platform-wide (club_id IS NULL)
    -- block above on purpose: a site-wide grant here would satisfy every club
    -- gate through is_site_admin() and make this account as useless for scope
    -- testing as the one it was split from (MYK9-137).
    ('clubadmin@myk9t.com', 'club_admin')
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
  AND person.auth_user_id IS NOT NULL
  AND user_role.club_id = demo_club.id
  AND user_role.show_id IS NULL;

WITH desired(email, role_name) AS (
  VALUES
    ('secretary@myk9t.com', 'secretary'),
    ('testadmin@myk9t.com', 'secretary'),
    ('testadmin@myk9t.com', 'club_admin'),
    -- chairman lives on its own account rather than on testadmin, for the same
    -- reason the club admin does: a fixture that also holds site_admin satisfies
    -- a role gate through the wrong branch, so an assertion written with it is
    -- vacuous whether or not the scoping it claims to test exists.
    ('chairman@myk9t.com', 'chairman'),
    -- CLUB-SCOPED ONLY, and absent from the platform-wide (club_id IS NULL)
    -- block above on purpose: a site-wide grant here would satisfy every club
    -- gate through is_site_admin() and make this account as useless for scope
    -- testing as the one it was split from (MYK9-137).
    ('clubadmin@myk9t.com', 'club_admin')
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
WHERE person.auth_user_id IS NOT NULL
  AND NOT EXISTS (
  SELECT 1
  FROM public.user_roles AS user_role
  WHERE user_role.user_id = person.id
    AND user_role.role_id = role.id
    AND user_role.club_id = demo_club.id
    AND user_role.show_id IS NULL
);

COMMIT;
