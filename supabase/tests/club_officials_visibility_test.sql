-- get_club_officials (MYK9-860): who may see a club's admins and secretaries by name.
--
-- The property that made this RPC necessary: a club admin must see their CO-admins.
-- A direct user_roles read cannot do that (SA-006 scopes it to the caller's own row),
-- so a club with two admins showed each of them "Admin: <themselves>" as if complete.
-- Also asserted: members see the list, a suspended member and outsiders get zero rows
-- (not an error, since the header calls this for every signed-in viewer), and anon is
-- refused by the grant.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000860001', 'Officials Test Club'),
  ('00000000-0000-0000-0000-000000860002', 'Officials Other Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id)
VALUES ('00000000-0000-0000-0000-000000860003', 'Officials Scoped Show',
        'Officials Test Club', CURRENT_DATE, CURRENT_DATE + 1,
        '00000000-0000-0000-0000-000000860001');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000860011', 'Officials', 'Admin One', '00000000-0000-0000-0000-000000860101'),
  ('00000000-0000-0000-0000-000000860012', 'Officials', 'Admin Two', '00000000-0000-0000-0000-000000860102'),
  ('00000000-0000-0000-0000-000000860013', 'Officials', 'Secretary', '00000000-0000-0000-0000-000000860103'),
  ('00000000-0000-0000-0000-000000860014', 'Officials', 'Member', '00000000-0000-0000-0000-000000860104'),
  ('00000000-0000-0000-0000-000000860015', 'Officials', 'Suspended', '00000000-0000-0000-0000-000000860105'),
  ('00000000-0000-0000-0000-000000860016', 'Officials', 'Other Admin', '00000000-0000-0000-0000-000000860106'),
  ('00000000-0000-0000-0000-000000860017', 'Officials', 'Bystander', '00000000-0000-0000-0000-000000860107'),
  ('00000000-0000-0000-0000-000000860018', 'Officials', 'Scoped Admin', '00000000-0000-0000-0000-000000860108');

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  ('00000000-0000-0000-0000-000000860001', '00000000-0000-0000-0000-000000860014', 'active'),
  ('00000000-0000-0000-0000-000000860001', '00000000-0000-0000-0000-000000860015', 'suspended');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, r.id, fixture.club_id, true, fixture.auth_id
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000860011'::uuid, '00000000-0000-0000-0000-000000860101'::uuid,
     '00000000-0000-0000-0000-000000860001'::uuid, 'club_admin'),
    ('00000000-0000-0000-0000-000000860012'::uuid, '00000000-0000-0000-0000-000000860102'::uuid,
     '00000000-0000-0000-0000-000000860001'::uuid, 'club_admin'),
    ('00000000-0000-0000-0000-000000860013'::uuid, '00000000-0000-0000-0000-000000860103'::uuid,
     '00000000-0000-0000-0000-000000860001'::uuid, 'secretary'),
    ('00000000-0000-0000-0000-000000860016'::uuid, '00000000-0000-0000-0000-000000860106'::uuid,
     '00000000-0000-0000-0000-000000860002'::uuid, 'club_admin')
) AS fixture(person_id, auth_id, club_id, role_name)
JOIN public.roles r ON r.name = fixture.role_name;

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000860018', r.id,
       '00000000-0000-0000-0000-000000860001',
       '00000000-0000-0000-0000-000000860003', true,
       '00000000-0000-0000-0000-000000860108'
FROM public.roles r WHERE r.name = 'club_admin';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  club constant uuid := '00000000-0000-0000-0000-000000860001';
  total integer;
  admins integer;
  viewer record;
BEGIN
  -- 1. Each viewer allowed to see the list gets the whole of it: two admins, one
  --    secretary. Admin One seeing Admin Two is the co-admin case SA-006 hid.
  FOR viewer IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000860101', 'club admin'),
      ('00000000-0000-0000-0000-000000860103', 'club secretary'),
      ('00000000-0000-0000-0000-000000860104', 'active member')
    ) AS v(auth_id, label)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', viewer.auth_id, true);

    SELECT count(*), count(*) FILTER (WHERE o.role = 'club_admin')
    INTO total, admins
    FROM public.get_club_officials(club) o;

    IF total <> 3 OR admins <> 2 THEN
      RAISE EXCEPTION 'FAIL % saw % officials (% admins), expected 3 (2 admins)',
        viewer.label, total, admins;
    END IF;
  END LOOP;

  -- 2. The co-admin is named, composed the same way get_club_show_managers does.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000860101', true);
  IF NOT EXISTS (
    SELECT 1 FROM public.get_club_officials(club) o
    WHERE o.role = 'club_admin'
      AND o.person_id = '00000000-0000-0000-0000-000000860012'
      AND o.person_name = 'Officials Admin Two'
  ) THEN
    RAISE EXCEPTION 'FAIL a club admin could not see their co-admin by name';
  END IF;

  -- 3. Zero rows, not 42501, for a suspended member, another club's admin, a
  --    show-pinned admin, and an unrelated signed-in user.
  FOR viewer IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000860105', 'suspended member'),
      ('00000000-0000-0000-0000-000000860106', 'another club''s admin'),
      ('00000000-0000-0000-0000-000000860108', 'show-pinned admin'),
      ('00000000-0000-0000-0000-000000860107', 'unrelated user')
    ) AS v(auth_id, label)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', viewer.auth_id, true);
    SELECT count(*) INTO total FROM public.get_club_officials(club);
    IF total <> 0 THEN
      RAISE EXCEPTION 'FAIL % saw % officials, expected 0', viewer.label, total;
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS get_club_officials shows co-admins to members and staff, nothing to outsiders';
END;
$$;

-- 4. Guests are refused by the grant, not by the body.
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM public.get_club_officials('00000000-0000-0000-0000-000000860001');
    RAISE EXCEPTION 'FAIL anon executed get_club_officials';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RAISE NOTICE 'PASS anon cannot execute get_club_officials';
END;
$$;

RESET ROLE;
ROLLBACK;
