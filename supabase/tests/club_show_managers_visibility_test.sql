-- get_club_show_managers: who may ask "who runs this club's shows", and what comes back.
--
-- This RPC exists because appointment no longer implies club membership, so a club's
-- appointees can no longer be listed by filtering the roster. It returns names and
-- email addresses, which is why it restates the caller check internally rather than
-- relying on the plain `authenticated` grant the older id-only lookup carries.
--
-- Two properties are asserted, and the second is the one that would be embarrassing to
-- get wrong: the gate holds against another club's admin, and a non-member appointee
-- actually comes back flagged as such.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000229001', 'Show Managers Test Club'),
  ('00000000-0000-0000-0000-000000229002', 'Unrelated Test Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000229011', 'Managers', 'Club Admin', '00000000-0000-0000-0000-000000229101'),
  ('00000000-0000-0000-0000-000000229012', 'Managers', 'Member Secretary', '00000000-0000-0000-0000-000000229102'),
  ('00000000-0000-0000-0000-000000229013', 'Managers', 'Hired Secretary', '00000000-0000-0000-0000-000000229103'),
  ('00000000-0000-0000-0000-000000229014', 'Managers', 'Other Club Admin', '00000000-0000-0000-0000-000000229104'),
  ('00000000-0000-0000-0000-000000229015', 'Managers', 'Bystander', '00000000-0000-0000-0000-000000229105');

-- Only the first secretary is enrolled. The second is the professional the roster
-- cannot represent.
INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000000229001', '00000000-0000-0000-0000-000000229012', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000229011', r.id,
       '00000000-0000-0000-0000-000000229001', true,
       '00000000-0000-0000-0000-000000229101'
FROM public.roles r WHERE r.name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000229014', r.id,
       '00000000-0000-0000-0000-000000229002', true,
       '00000000-0000-0000-0000-000000229104'
FROM public.roles r WHERE r.name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, r.id,
       '00000000-0000-0000-0000-000000229001', true, fixture.auth_id
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000229012'::uuid, '00000000-0000-0000-0000-000000229102'::uuid),
    ('00000000-0000-0000-0000-000000229013'::uuid, '00000000-0000-0000-0000-000000229103'::uuid)
) AS fixture(person_id, auth_id)
JOIN public.roles r ON r.name = 'secretary';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  total integer;
  hired record;
BEGIN
  -- 1. The club's own admin sees both appointees, member and not.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000229101', true);

  SELECT count(*) INTO total
  FROM public.get_club_show_managers('00000000-0000-0000-0000-000000229001');
  IF total <> 2 THEN
    RAISE EXCEPTION 'FAIL club admin saw % appointees, expected 2', total;
  END IF;

  -- 2. The non-member comes back, and is flagged. This is the row the members roster
  --    structurally cannot produce, so if it is missing the tab is pointless.
  SELECT * INTO hired
  FROM public.get_club_show_managers('00000000-0000-0000-0000-000000229001')
  WHERE person_id = '00000000-0000-0000-0000-000000229013';

  IF hired IS NULL THEN
    RAISE EXCEPTION 'FAIL the non-member appointee was not returned at all';
  END IF;
  IF hired.is_club_member THEN
    RAISE EXCEPTION 'FAIL the non-member appointee was reported as a club member';
  END IF;
  IF hired.person_name <> 'Managers Hired Secretary' THEN
    RAISE EXCEPTION 'FAIL expected a composed person_name, got %', hired.person_name;
  END IF;

  -- 3. The enrolled one is flagged the other way, or the badge means nothing.
  SELECT * INTO hired
  FROM public.get_club_show_managers('00000000-0000-0000-0000-000000229001')
  WHERE person_id = '00000000-0000-0000-0000-000000229012';
  IF NOT hired.is_club_member OR hired.membership_status <> 'active' THEN
    RAISE EXCEPTION 'FAIL the enrolled appointee lost its membership flag';
  END IF;

  -- 4. One of the club's own secretaries may also ask.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000229102', true);
  SELECT count(*) INTO total
  FROM public.get_club_show_managers('00000000-0000-0000-0000-000000229001');
  IF total <> 2 THEN
    RAISE EXCEPTION 'FAIL club secretary saw % appointees, expected 2', total;
  END IF;

  -- 5. Another club's admin must not. Names and emails are not public.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000229104', true);
  BEGIN
    PERFORM public.get_club_show_managers('00000000-0000-0000-0000-000000229001');
    RAISE EXCEPTION 'FAIL another club''s admin listed this club''s show managers';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- 6. Nor may a signed-in user with no relationship to the club.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000229105', true);
  BEGIN
    PERFORM public.get_club_show_managers('00000000-0000-0000-0000-000000229001');
    RAISE EXCEPTION 'FAIL an unrelated authenticated user listed show managers';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RAISE NOTICE 'PASS get_club_show_managers is club-gated and surfaces non-member appointees';
END;
$$;

RESET ROLE;
ROLLBACK;
