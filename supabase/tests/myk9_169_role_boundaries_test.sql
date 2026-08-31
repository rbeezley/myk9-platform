-- Club secretary policy matrix.
--
-- REWRITTEN, deliberately, alongside 20260830210000_appointment_grants_show_access.sql.
-- This file previously asserted the OPPOSITE of what it asserts now: that club-scoped
-- secretary access required an active club_members row, so a lapsed or suspended member
-- lost show access. That was MYK9-169, and it was a considered decision, not drift — the
-- reversal is considered too, and the reasoning is in the migration header.
--
-- The rule now:
--
--   A club appoints its secretaries. Any appointed secretary can run any of that
--   club's shows. Appointment is the only thing that grants access.
--
-- Both directions matter and both are asserted here: appointment grants without
-- membership, and membership grants nothing without appointment.
--
-- What MYK9-169 got right and this file still pins: a role lookup must never promote a
-- club appointment into access at a DIFFERENT club, and must never act as a
-- platform-wide grant. That is migration 102's guarantee, and it is the expensive thing
-- to lose while editing this predicate.

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
  ('00000000-0000-0000-0000-000000169015', 'MYK9-169', 'External Secretary', '00000000-0000-0000-0000-000000169105'),
  ('00000000-0000-0000-0000-000000169016', 'MYK9-169', 'Show Scoped Only', '00000000-0000-0000-0000-000000169106'),
  ('00000000-0000-0000-0000-000000169017', 'MYK9-169', 'Plain Member', '00000000-0000-0000-0000-000000169107'),
  ('00000000-0000-0000-0000-000000169018', 'MYK9-169', 'Club Chairman', '00000000-0000-0000-0000-000000169108');

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

-- Membership states are seeded precisely so the assertions below can prove that they
-- no longer affect access. 'Plain Member' is an active member who is never appointed.
INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  ('00000000-0000-0000-0000-000000169001', '00000000-0000-0000-0000-000000169012', 'active'),
  ('00000000-0000-0000-0000-000000169001', '00000000-0000-0000-0000-000000169013', 'lapsed'),
  ('00000000-0000-0000-0000-000000169001', '00000000-0000-0000-0000-000000169014', 'suspended'),
  ('00000000-0000-0000-0000-000000169001', '00000000-0000-0000-0000-000000169017', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000169011',
  r.id,
  '00000000-0000-0000-0000-000000169001',
  true,
  '00000000-0000-0000-0000-000000169101'
FROM public.roles r
WHERE r.name = 'club_admin';

-- A club-scoped chairman, to prove secretary/chairman/steward now follow one rule.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000169018',
  r.id,
  '00000000-0000-0000-0000-000000169001',
  true,
  '00000000-0000-0000-0000-000000169108'
FROM public.roles r
WHERE r.name = 'chairman';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169101', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000169101","role":"authenticated"}',
  true
);

-- Appointment succeeds regardless of membership state, including for someone with no
-- club_members row at all. Under MYK9-169 the last three of these raised 42501.
SELECT public.grant_club_secretary(
  '00000000-0000-0000-0000-000000169012',
  '00000000-0000-0000-0000-000000169001'
);
SELECT public.grant_club_secretary(
  '00000000-0000-0000-0000-000000169013',
  '00000000-0000-0000-0000-000000169001'
);
SELECT public.grant_club_secretary(
  '00000000-0000-0000-0000-000000169014',
  '00000000-0000-0000-0000-000000169001'
);
SELECT public.grant_club_secretary(
  '00000000-0000-0000-0000-000000169015',
  '00000000-0000-0000-0000-000000169001'
);

-- Naming someone on a show's paperwork. Since Phase 2 this writes show_officials and
-- grants nothing at all; the assertions below pin both halves of that.
SELECT public.grant_show_official(
  '00000000-0000-0000-0000-000000169016',
  'secretary',
  '00000000-0000-0000-0000-000000169003'
);

DO $$
DECLARE
  fixture record;
  manager_count integer;
BEGIN
  -- 1. Every appointee reaches the club's show, whatever their membership says.
  FOR fixture IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000169102'::uuid, 'active member'),
      ('00000000-0000-0000-0000-000000169103'::uuid, 'lapsed member'),
      ('00000000-0000-0000-0000-000000169104'::uuid, 'suspended member'),
      ('00000000-0000-0000-0000-000000169105'::uuid, 'non-member professional')
    ) AS f(auth_id, label)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', fixture.auth_id::text, true);

    IF NOT public.is_trial_secretary('00000000-0000-0000-0000-000000169001') THEN
      RAISE EXCEPTION 'FAIL appointed % has no club-scoped access', fixture.label;
    END IF;

    -- 2. Parity: the three helpers must agree, or the same row means different
    --    things depending on which one a policy happens to call.
    IF NOT public.is_show_secretary('00000000-0000-0000-0000-000000169003')
       OR NOT public.is_show_official('00000000-0000-0000-0000-000000169003') THEN
      RAISE EXCEPTION 'FAIL helpers disagree for appointed %', fixture.label;
    END IF;

    -- 3. Migration 102's guarantee: an appointment is club-scoped, never global.
    IF public.is_trial_secretary('00000000-0000-0000-0000-000000169002')
       OR public.is_show_secretary('00000000-0000-0000-0000-000000169004')
       OR public.is_show_official('00000000-0000-0000-0000-000000169004') THEN
      RAISE EXCEPTION 'FAIL appointed % reached another club''s show', fixture.label;
    END IF;
  END LOOP;

  -- 4. The other direction: membership alone grants nothing. An active member who was
  --    never appointed must have no access — otherwise this change would have widened
  --    access to every member of every club.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169107', true);
  IF public.is_trial_secretary('00000000-0000-0000-0000-000000169001')
     OR public.is_show_secretary('00000000-0000-0000-0000-000000169003')
     OR public.is_show_official('00000000-0000-0000-0000-000000169003') THEN
    RAISE EXCEPTION 'FAIL an unappointed active member has show access';
  END IF;

  -- 5. Being NAMED on a show grants nothing. This inverts what this file used to
  --    assert: before Phase 2 a show-scoped user_roles row was both the paperwork
  --    record and a grant, so "appointment is the only thing that grants access" was
  --    true of the club path and false of this one. The label now lives in
  --    show_officials and carries no permission.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169106', true);
  IF public.is_show_secretary('00000000-0000-0000-0000-000000169003') THEN
    RAISE EXCEPTION 'FAIL being named on a show still grants show access';
  END IF;
  IF public.is_trial_secretary('00000000-0000-0000-0000-000000169001') THEN
    RAISE EXCEPTION 'FAIL being named on a show granted club-wide access';
  END IF;

  -- ...but the naming itself survived, or the paperwork lost its Trial Secretary.
  IF NOT EXISTS (
    SELECT 1 FROM public.get_show_officials('00000000-0000-0000-0000-000000169003')
    WHERE user_id = '00000000-0000-0000-0000-000000169016' AND role = 'secretary'
  ) THEN
    RAISE EXCEPTION 'FAIL the named show secretary is missing from get_show_officials';
  END IF;

  -- 6. Secretary, chairman and steward now follow ONE rule. Before this change the
  --    chairman arm skipped the membership test that the secretary arm applied, so the
  --    two disagreed for the same shape of row.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169108', true);
  IF NOT public.is_show_official('00000000-0000-0000-0000-000000169003') THEN
    RAISE EXCEPTION 'FAIL club-scoped chairman lost show official access';
  END IF;
  IF public.is_show_official('00000000-0000-0000-0000-000000169004') THEN
    RAISE EXCEPTION 'FAIL club-scoped chairman reached another club''s show';
  END IF;

  -- 7. The notification fan-out follows the same rule: all four appointees, and not
  --    the unappointed member.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000169101', true);
  SELECT count(*) INTO manager_count
  FROM public.get_club_show_manager_ids('00000000-0000-0000-0000-000000169001');
  IF manager_count <> 4 THEN
    RAISE EXCEPTION 'FAIL club manager lookup returned % rows, expected 4 appointees', manager_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_club_show_manager_ids('00000000-0000-0000-0000-000000169001')
    WHERE user_id = '00000000-0000-0000-0000-000000169017'
  ) THEN
    RAISE EXCEPTION 'FAIL unappointed member appeared in the club manager lookup';
  END IF;

  RAISE NOTICE 'PASS appointment grants show access; membership neither grants nor revokes';
END;
$$;

RESET ROLE;
ROLLBACK;
