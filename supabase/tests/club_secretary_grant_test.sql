-- Behavioral authorization and reactivation test for grant_club_secretary.
-- All fixtures and role changes roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000000a21', 'Secretary Grant Test Club'),
  ('00000000-0000-0000-0000-000000000a22', 'Unrelated Secretary Test Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000a11',
    'Grant',
    'Administrator',
    '00000000-0000-0000-0000-000000000a01'
  ),
  (
    '00000000-0000-0000-0000-000000000a12',
    'Expired',
    'Secretary',
    '00000000-0000-0000-0000-000000000a02'
  );

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES (
  '00000000-0000-0000-0000-000000000a21',
  '00000000-0000-0000-0000-000000000a12',
  'active'
);

INSERT INTO public.user_roles (
  user_id,
  role_id,
  club_id,
  is_active,
  auth_user_id
)
SELECT
  '00000000-0000-0000-0000-000000000a11',
  id,
  '00000000-0000-0000-0000-000000000a21',
  true,
  '00000000-0000-0000-0000-000000000a01'
FROM public.roles
WHERE name = 'club_admin';

INSERT INTO public.user_roles (
  user_id,
  role_id,
  club_id,
  is_active,
  expires_at,
  auth_user_id
)
SELECT
  '00000000-0000-0000-0000-000000000a12',
  id,
  '00000000-0000-0000-0000-000000000a21',
  false,
  clock_timestamp() - interval '1 day',
  '00000000-0000-0000-0000-000000000a02'
FROM public.roles
WHERE name = 'secretary';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000a01',
  true
);

SELECT public.grant_club_secretary(
  '00000000-0000-0000-0000-000000000a12',
  '00000000-0000-0000-0000-000000000a21'
);

RESET ROLE;

DO $$
DECLARE
  assignment_active boolean;
  assignment_expiry timestamptz;
  assignment_grantor uuid;
BEGIN
  SELECT ur.is_active, ur.expires_at, ur.granted_by
    INTO assignment_active, assignment_expiry, assignment_grantor
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = '00000000-0000-0000-0000-000000000a12'
     AND ur.club_id = '00000000-0000-0000-0000-000000000a21'
     AND ur.show_id IS NULL
     AND r.name = 'secretary';

  IF assignment_active IS DISTINCT FROM true
     OR assignment_expiry IS NOT NULL
     OR assignment_grantor IS DISTINCT FROM
       '00000000-0000-0000-0000-000000000a11'::uuid THEN
    RAISE EXCEPTION
      'FAIL expired secretary grant was not fully reactivated: active=%, expiry=%, grantor=%',
      assignment_active,
      assignment_expiry,
      assignment_grantor;
  END IF;

  RAISE NOTICE 'PASS expired secretary grant is fully reactivated';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000a01',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM public.grant_club_secretary(
      '00000000-0000-0000-0000-000000000a12',
      '00000000-0000-0000-0000-000000000a22'
    );
    RAISE EXCEPTION 'FAIL cross-club secretary grant succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS cross-club secretary grant is rejected';
  END;
END;
$$;

ROLLBACK;
