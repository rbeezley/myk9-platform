-- MYK9-2393 behavioral contract: saving the qualification list through
-- replace_judge_qualifications keeps the columns the form does not own
-- (suspension_*, approval_*, notes, id, created_at) on rows it updates, deletes rows
-- absent from the payload, refuses an id from another person, and keeps the MYK9-354
-- authorization. All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000239310', 'MYK9-2393 Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000239301', 'MYK9-2393', 'Judge', 'myk9-2393-judge@example.test', NULL),
  ('00000000-0000-0000-0000-000000239302', 'MYK9-2393', 'Secretary', 'myk9-2393-secretary@example.test', NULL),
  ('00000000-0000-0000-0000-000000239304', 'MYK9-2393', 'Other', 'myk9-2393-other@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000239101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-2393-judge@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000239102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-2393-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000239301'::uuid, '00000000-0000-0000-0000-000000239101'::uuid),
  ('00000000-0000-0000-0000-000000239302'::uuid, '00000000-0000-0000-0000-000000239102'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000239302', roles.id, '00000000-0000-0000-0000-000000239310', true,
       '00000000-0000-0000-0000-000000239102'
FROM public.roles
WHERE roles.name = 'secretary';

-- Seed as the test owner. The suspended row has every column the form does not own.
INSERT INTO public.judge_qualifications (
  id, person_id, organization, qualification_level, disciplines, judge_number,
  date_obtained, is_active, suspension_date, suspension_reason, approval_number,
  approved_by, notes, created_at
)
VALUES
  ('00000000-0000-0000-0000-000000239501', '00000000-0000-0000-0000-000000239301', 'AKC', 'Master',
   ARRAY['Scent Work'], 'AKC-1', NULL, false, DATE '2026-01-05', 'Dues unpaid', 'APP-77',
   'Reviewer', 'Keep these notes', TIMESTAMPTZ '2026-01-01 00:00:00+00'),
  ('00000000-0000-0000-0000-000000239502', '00000000-0000-0000-0000-000000239301', 'UKC', 'Novice',
   ARRAY['Scent Work'], 'UKC-1', DATE '2025-05-05', true, NULL, NULL, NULL, NULL, NULL,
   TIMESTAMPTZ '2026-01-02 00:00:00+00'),
  ('00000000-0000-0000-0000-000000239503', '00000000-0000-0000-0000-000000239304', 'CPE', 'Other',
   ARRAY['Scent Work'], 'OTHER-1', NULL, true, NULL, NULL, NULL, NULL, NULL, now());

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  judge_auth_id CONSTANT uuid := '00000000-0000-0000-0000-000000239101';
  secretary_auth_id CONSTANT uuid := '00000000-0000-0000-0000-000000239102';
  target_person_id CONSTANT uuid := '00000000-0000-0000-0000-000000239301';
  suspended_id CONSTANT uuid := '00000000-0000-0000-0000-000000239501';
  dropped_id CONSTANT uuid := '00000000-0000-0000-0000-000000239502';
  foreign_id CONSTANT uuid := '00000000-0000-0000-0000-000000239503';
  kept public.judge_qualifications%ROWTYPE;
  row_count integer;
  denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', secretary_auth_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary_auth_id, 'role', 'authenticated')::text, true);

  -- Secretary adds an organization; the UKC row is absent so it is deleted.
  PERFORM public.replace_judge_qualifications(target_person_id, jsonb_build_array(
    jsonb_build_object(
      'id', suspended_id, 'person_id', target_person_id, 'organization', 'AKC',
      'qualification_level', 'Master', 'disciplines', jsonb_build_array('Scent Work'),
      'judge_number', 'AKC-2', 'is_active', false
    ),
    jsonb_build_object(
      'person_id', target_person_id, 'organization', 'NACSW',
      'qualification_level', 'Level 1', 'disciplines', jsonb_build_array('Scent Work'),
      'date_obtained', '2026-11-01'
    )
  ));

  SELECT * INTO kept FROM public.judge_qualifications WHERE id = suspended_id;
  IF kept.id IS NULL THEN
    RAISE EXCEPTION 'FAIL the suspended row was recreated or removed';
  END IF;
  IF kept.suspension_date IS DISTINCT FROM DATE '2026-01-05'
     OR kept.suspension_reason IS DISTINCT FROM 'Dues unpaid'
     OR kept.notes IS DISTINCT FROM 'Keep these notes'
     OR kept.approval_number IS DISTINCT FROM 'APP-77'
     OR kept.approved_by IS DISTINCT FROM 'Reviewer'
     OR kept.created_at IS DISTINCT FROM TIMESTAMPTZ '2026-01-01 00:00:00+00' THEN
    RAISE EXCEPTION 'FAIL save lost a column the form does not own: %', to_jsonb(kept);
  END IF;
  IF kept.is_active IS DISTINCT FROM false OR kept.date_obtained IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL suspended row is_active or null date_obtained changed: %', to_jsonb(kept);
  END IF;
  IF kept.judge_number IS DISTINCT FROM 'AKC-2' THEN
    RAISE EXCEPTION 'FAIL form-owned judge_number was not updated';
  END IF;

  SELECT count(*) INTO row_count FROM public.judge_qualifications
  WHERE person_id = target_person_id AND organization = 'NACSW';
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FAIL new qualification was not inserted';
  END IF;
  SELECT count(*) INTO row_count FROM public.judge_qualifications WHERE id = dropped_id;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'FAIL row absent from the payload was not deleted';
  END IF;
  SELECT count(*) INTO row_count FROM public.judge_qualifications WHERE person_id = target_person_id;
  IF row_count <> 2 THEN
    RAISE EXCEPTION 'FAIL expected 2 qualifications after save, found %', row_count;
  END IF;

  -- An id belonging to another person is refused and changes nothing.
  denied := false;
  BEGIN
    PERFORM public.replace_judge_qualifications(target_person_id, jsonb_build_array(
      jsonb_build_object(
        'id', foreign_id, 'person_id', target_person_id, 'organization', 'HIJACK',
        'qualification_level', 'X', 'disciplines', jsonb_build_array('Scent Work')
      )
    ));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Qualification id does not belong to target person' THEN
      RAISE EXCEPTION 'FAIL foreign id raised unexpected error: %', SQLERRM;
    END IF;
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FAIL an id from another person was accepted';
  END IF;
  SELECT count(*) INTO row_count FROM public.judge_qualifications
  WHERE id = foreign_id AND organization = 'CPE';
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FAIL the other person''s row was changed';
  END IF;

  -- A non-staff caller is still refused.
  PERFORM set_config('request.jwt.claim.sub', judge_auth_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', judge_auth_id, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    PERFORM public.replace_judge_qualifications(target_person_id, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Not authorized to replace judge qualifications' THEN
      RAISE EXCEPTION 'FAIL non-staff caller raised unexpected error: %', SQLERRM;
    END IF;
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FAIL non-staff caller replaced qualifications';
  END IF;

  RAISE NOTICE 'PASS MYK9-2393 suspension, notes, approval, id and created_at survive a save; absent rows deleted; foreign id and non-staff refused';
END;
$$;

ROLLBACK;
