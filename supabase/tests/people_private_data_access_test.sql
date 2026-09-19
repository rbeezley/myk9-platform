-- MYK9-664 assertion-first behavioral coverage.
-- The fixture is transaction-local and proves the five required caller shapes:
-- self, related show manager, unrelated manager, exhibitor, and anon.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('secretary', 'MYK9-664 fixture', true),
  ('site_admin', 'MYK9-664 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000664001', 'MYK9-664 Related Club'),
  ('00000000-0000-0000-0000-000000664002', 'MYK9-664 Other Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000664011', 'MYK9-664', 'Related Manager', '00000000-0000-0000-0000-000000664101'),
  ('00000000-0000-0000-0000-000000664012', 'MYK9-664', 'Unrelated Manager', '00000000-0000-0000-0000-000000664102'),
  ('00000000-0000-0000-0000-000000664013', 'MYK9-664', 'Exhibitor', '00000000-0000-0000-0000-000000664103'),
  ('00000000-0000-0000-0000-000000664014', 'MYK9-664', 'Handler', '00000000-0000-0000-0000-000000664104'),
  ('00000000-0000-0000-0000-000000664015', 'MYK9-664', 'Site Admin', '00000000-0000-0000-0000-000000664105'),
  ('00000000-0000-0000-0000-000000664016', 'MYK9-664', 'Deleted Handler', '00000000-0000-0000-0000-000000664106');

UPDATE public.people
SET deleted_at = current_timestamp
WHERE id = '00000000-0000-0000-0000-000000664016';

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  ('00000000-0000-0000-0000-000000664001', '00000000-0000-0000-0000-000000664011', 'active'),
  ('00000000-0000-0000-0000-000000664002', '00000000-0000-0000-0000-000000664012', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, r.id, fixture.club_id, true, fixture.auth_user_id
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000664011'::uuid, '00000000-0000-0000-0000-000000664001'::uuid, '00000000-0000-0000-0000-000000664101'::uuid, 'secretary'::text),
    ('00000000-0000-0000-0000-000000664012'::uuid, '00000000-0000-0000-0000-000000664002'::uuid, '00000000-0000-0000-0000-000000664102'::uuid, 'secretary'::text),
    ('00000000-0000-0000-0000-000000664015'::uuid, NULL::uuid, '00000000-0000-0000-0000-000000664105'::uuid, 'site_admin'::text)
) AS fixture(person_id, club_id, auth_user_id, role_name)
JOIN public.roles r ON r.name = fixture.role_name;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000664003', 'MYK9-664 Related Show', 'MYK9-664 Organization',
  current_date, current_date, '00000000-0000-0000-0000-000000664001', 'published'
);

INSERT INTO public.entries (id, show_id, handler_id, entry_status, payment_status)
VALUES (
  '00000000-0000-0000-0000-000000664004',
  '00000000-0000-0000-0000-000000664003',
  '00000000-0000-0000-0000-000000664014',
  'confirmed', 'paid'
);

INSERT INTO public.people_private (person_id, date_of_birth, junior_handler_numbers)
VALUES (
  '00000000-0000-0000-0000-000000664014', DATE '2012-04-02', '{"AKC":"664-JR"}'::jsonb
);

DO $$
DECLARE
  handler_id uuid := '00000000-0000-0000-0000-000000664014';
  related_manager uuid := '00000000-0000-0000-0000-000000664101';
  unrelated_manager uuid := '00000000-0000-0000-0000-000000664102';
  exhibitor uuid := '00000000-0000-0000-0000-000000664103';
  self_auth uuid := '00000000-0000-0000-0000-000000664104';
  site_admin uuid := '00000000-0000-0000-0000-000000664105';
  deleted_handler uuid := '00000000-0000-0000-0000-000000664016';
  visible_rows integer;
  writes_denied boolean;
  private_dob date;
  private_numbers jsonb;
BEGIN
  IF has_table_privilege('anon', 'public.people_private', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon retained people_private SELECT';
  END IF;
  IF has_function_privilege('anon', 'public.get_people_private(uuid[])', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute get_people_private';
  END IF;
  IF has_function_privilege('anon', 'public.update_person_with_private(uuid,jsonb,jsonb)', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute update_person_with_private';
  END IF;

  SET LOCAL ROLE authenticated;

  -- Self: subject can read and write their own private row.
  PERFORM set_config('request.jwt.claim.sub', self_auth::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', self_auth, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[handler_id]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL self cannot read private profile'; END IF;
  PERFORM public.update_person_with_private(
    handler_id,
    '{"phone":"self-save"}'::jsonb,
    '{"date_of_birth":"2012-04-03","junior_handler_numbers":{"AKC":"664-JR-2"}}'::jsonb
  );
  PERFORM public.update_person_with_private(
    handler_id,
    '{}'::jsonb,
    '{"junior_handler_numbers":{}}'::jsonb
  );
  SELECT date_of_birth, junior_handler_numbers
  INTO private_dob, private_numbers
  FROM public.people_private
  WHERE person_id = handler_id;
  IF private_dob IS DISTINCT FROM DATE '2012-04-03' THEN
    RAISE EXCEPTION 'FAIL omitted private date was not preserved';
  END IF;
  IF private_numbers IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL explicit empty junior-number map did not clear existing values';
  END IF;

  -- Related manager: entry -> show -> managed club is the only manager read arm.
  PERFORM set_config('request.jwt.claim.sub', related_manager::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', related_manager, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[handler_id]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL related show manager cannot read private profile'; END IF;
  PERFORM public.update_person_with_private(handler_id, '{"phone":"manager-save"}'::jsonb, '{}'::jsonb);
  writes_denied := false;
  BEGIN
    PERFORM public.upsert_people_private(handler_id, DATE '2012-04-04', '{"AKC":"manager"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    writes_denied := true;
  END;
  IF NOT writes_denied THEN RAISE EXCEPTION 'FAIL related show manager can write private profile'; END IF;
  writes_denied := false;
  BEGIN
    PERFORM public.update_person_with_private(
      handler_id,
      '{"phone":"manager-private"}'::jsonb,
      '{"date_of_birth":"2012-04-04"}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    writes_denied := true;
  END;
  IF NOT writes_denied THEN RAISE EXCEPTION 'FAIL related show manager can atomically write private profile'; END IF;

  -- Unrelated manager: role in another club does not expose this handler.
  PERFORM set_config('request.jwt.claim.sub', unrelated_manager::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', unrelated_manager, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[handler_id]);
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'FAIL unrelated manager can read private profile'; END IF;

  -- Exhibitor with no relationship is denied as well.
  PERFORM set_config('request.jwt.claim.sub', exhibitor::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', exhibitor, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[handler_id]);
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'FAIL exhibitor can read another person private profile'; END IF;

  -- Site admin retains read/write oversight.
  PERFORM set_config('request.jwt.claim.sub', site_admin::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', site_admin, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[handler_id]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL site admin cannot read private profile'; END IF;
  PERFORM public.update_person_with_private(
    handler_id,
    '{}'::jsonb,
    '{"date_of_birth":"2012-04-05","junior_handler_numbers":{"AKC":"664-JR-5"}}'::jsonb
  );

  writes_denied := false;
  BEGIN
    PERFORM public.upsert_people_private(deleted_handler, DATE '2012-04-06', '{}'::jsonb);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    writes_denied := true;
  END;
  IF NOT writes_denied THEN
    RAISE EXCEPTION 'FAIL legacy private upsert can write soft-deleted person';
  END IF;

  RESET ROLE;
END;
$$;

ROLLBACK;
