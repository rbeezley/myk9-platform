-- MYK9-169 policy matrix.
-- Club-scoped secretary access requires active club membership. Explicit
-- show-scoped secretary access remains available to a non-member, but must not
-- be promoted to club-wide access by a role lookup.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000169001', 'MYK9-169 Club'),
  ('00000000-0000-0000-0000-000000169002', 'MYK9-169 Other Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000169011', 'MYK9-169', 'Club Admin', '00000000-0000-0000-0000-000000169101'),
  ('00000000-0000-0000-0000-000000169012', 'MYK9-169', 'Active Member', '00000000-0000-0000-0000-000000169102'),
  ('00000000-0000-0000-0000-000000169013', 'MYK9-169', 'Lapsed Member', '00000000-0000-0000-0000-000000169103'),
  ('00000000-0000-0000-0000-000000169014', 'MYK9-169', 'Suspended Member', '00000000-0000-0000-0000-000000169104'),
  ('00000000-0000-0000-0000-000000169015', 'MYK9-169', 'External Secretary', '00000000-0000-0000-0000-000000169105');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  (
    '00000000-0000-0000-0000-000000169003',
    'MYK9-169 Show',
    'AKC',
    current_date,
    current_date,
    '00000000-0000-0000-0000-000000169001',
    'published'
  ),
  (
    '00000000-0000-0000-0000-000000169004',
    'MYK9-169 Other Club Show',
    'AKC',
    current_date,
    current_date,
    '00000000-0000-0000-0000-000000169002',
    'published'
  );

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  ('00000000-0000-0000-0000-000000169001', '00000000-0000-0000-0000-000000169012', 'active'),
  ('00000000-0000-0000-0000-000000169001', '00000000-0000-0000-0000-000000169013', 'lapsed'),
  ('00000000-0000-0000-0000-000000169001', '00000000-0000-0000-0000-000000169014', 'suspended');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000169011',
  r.id,
  '00000000-0000-0000-0000-000000169001',
  true,
  '00000000-0000-0000-0000-000000169101'
FROM public.roles r
WHERE r.name = 'club_admin';

-- Existing stale role rows must not remain effective after membership lapses.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, r.id, fixture.club_id, true, fixture.auth_id
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000169013'::uuid, '00000000-0000-0000-0000-000000169103'::uuid),
    ('00000000-0000-0000-0000-000000169014'::uuid, '00000000-0000-0000-0000-000000169104'::uuid)
) AS fixture(person_id, auth_id)
CROSS JOIN (VALUES ('00000000-0000-0000-0000-000000169001'::uuid)) AS club(club_id)
JOIN public.roles r ON r.name = 'secretary';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169101', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000169101","role":"authenticated"}',
  true
);

SELECT public.grant_club_secretary(
  '00000000-0000-0000-0000-000000169012',
  '00000000-0000-0000-0000-000000169001'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.grant_club_secretary(
      '00000000-0000-0000-0000-000000169013',
      '00000000-0000-0000-0000-000000169001'
    );
    RAISE EXCEPTION 'FAIL lapsed member received club secretary access';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Club secretary access requires an active club membership%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.grant_club_secretary(
      '00000000-0000-0000-0000-000000169014',
      '00000000-0000-0000-0000-000000169001'
    );
    RAISE EXCEPTION 'FAIL suspended member received club secretary access';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Club secretary access requires an active club membership%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

-- The explicit show-scoped path permits an external professional secretary.
SELECT public.grant_show_official(
  '00000000-0000-0000-0000-000000169015',
  'secretary',
  '00000000-0000-0000-0000-000000169003'
);

DO $$
DECLARE
  active_manager_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169102', true);
  IF NOT public.is_trial_secretary('00000000-0000-0000-0000-000000169001')
     OR NOT public.is_show_secretary('00000000-0000-0000-0000-000000169003') THEN
    RAISE EXCEPTION 'FAIL active club secretary lost effective access';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169103', true);
  IF public.is_trial_secretary('00000000-0000-0000-0000-000000169001')
     OR public.is_show_secretary('00000000-0000-0000-0000-000000169003') THEN
    RAISE EXCEPTION 'FAIL lapsed secretary retained effective access';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169104', true);
  IF public.is_trial_secretary('00000000-0000-0000-0000-000000169001')
     OR public.is_show_secretary('00000000-0000-0000-0000-000000169003') THEN
    RAISE EXCEPTION 'FAIL suspended secretary retained effective access';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169105', true);
  IF public.is_trial_secretary('00000000-0000-0000-0000-000000169001')
     OR NOT public.is_show_secretary('00000000-0000-0000-0000-000000169003')
     OR public.is_show_secretary('00000000-0000-0000-0000-000000169004') THEN
    RAISE EXCEPTION 'FAIL external show secretary scope was not preserved';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169101', true);
  SELECT count(*) INTO active_manager_count
  FROM public.get_club_show_manager_ids('00000000-0000-0000-0000-000000169001');
  IF active_manager_count <> 1 THEN
    RAISE EXCEPTION 'FAIL club manager lookup returned % rows, expected active member only', active_manager_count;
  END IF;

  RAISE NOTICE 'PASS MYK9-169 active/lapsed/suspended club secretary and external show secretary matrix';
END;
$$;

RESET ROLE;
ROLLBACK;
