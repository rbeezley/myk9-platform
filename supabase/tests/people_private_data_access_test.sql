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
  ('00000000-0000-0000-0000-000000664017', 'Owner', 'Fallback', '00000000-0000-0000-0000-000000664107'),
  ('00000000-0000-0000-0000-000000664018', 'Empty', 'Profile', '00000000-0000-0000-0000-000000664108'),
  ('00000000-0000-0000-0000-000000664019', 'Hidden', 'Owner', '00000000-0000-0000-0000-000000664109'),
  ('00000000-0000-0000-0000-000000664015', 'MYK9-664', 'Site Admin', '00000000-0000-0000-0000-000000664105'),
  ('00000000-0000-0000-0000-000000664016', 'MYK9-664', 'Deleted Handler', '00000000-0000-0000-0000-000000664106');

UPDATE public.people
SET date_of_birth = DATE '2014-04-02',
    junior_handler_numbers = '{"AKC":"664-HIDDEN"}'::jsonb
WHERE id = '00000000-0000-0000-0000-000000664019';

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

INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES (
  '00000000-0000-0000-0000-000000664005', 'MYK9-664 Dog', 'Fallback Dog', 'Mixed',
  '00000000-0000-0000-0000-000000664017'
);
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES (
  '00000000-0000-0000-0000-000000664008', 'MYK9-664 Empty Dog', 'Empty Dog', 'Mixed',
  '00000000-0000-0000-0000-000000664018'
);
INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES (
  '00000000-0000-0000-0000-000000664010', 'MYK9-664 Hidden Dog', 'Hidden Dog', 'Mixed',
  '00000000-0000-0000-0000-000000664019'
);

-- The stale handler FK points at Handler, but the canonical printed name
-- resolves to the owner. A related manager may read the owner's private row.
INSERT INTO public.entries (id, show_id, dog_id, handler_id, handler, entry_status, payment_status)
VALUES (
  '00000000-0000-0000-0000-000000664006',
  '00000000-0000-0000-0000-000000664003',
  '00000000-0000-0000-0000-000000664005',
  '00000000-0000-0000-0000-000000664014',
  'Owner Fallback',
  'confirmed', 'paid'
);
INSERT INTO public.entries (id, show_id, dog_id, handler_id, handler, entry_status, payment_status)
VALUES (
  '00000000-0000-0000-0000-000000664008',
  '00000000-0000-0000-0000-000000664003',
  '00000000-0000-0000-0000-000000664008',
  NULL,
  NULL,
  'confirmed', 'paid'
);

-- Owner-handled entries commonly leave the denormalized handler text blank;
-- the resolver uses the owner's canonical name in that case.
INSERT INTO public.entries (id, show_id, dog_id, handler_id, handler, entry_status, payment_status)
VALUES (
  '00000000-0000-0000-0000-000000664007',
  '00000000-0000-0000-0000-000000664003',
  '00000000-0000-0000-0000-000000664005',
  NULL,
  NULL,
  'confirmed', 'paid'
);

-- The manager can update this owner through the manageable show, but the
-- printed handler name deliberately does not resolve to the owner. This
-- exercises the RPC response redaction for a public-update caller without a
-- private-read relationship.
INSERT INTO public.entries (id, show_id, dog_id, handler_id, handler, entry_status, payment_status)
VALUES (
  '00000000-0000-0000-0000-000000664010',
  '00000000-0000-0000-0000-000000664003',
  '00000000-0000-0000-0000-000000664010',
  '00000000-0000-0000-0000-000000664014',
  'Not the owner',
  'confirmed', 'paid'
);

INSERT INTO public.people_private (person_id, date_of_birth, junior_handler_numbers)
VALUES (
  '00000000-0000-0000-0000-000000664014', DATE '2012-04-02', '{"AKC":"664-JR"}'::jsonb
);
INSERT INTO public.people_private (person_id, date_of_birth, junior_handler_numbers)
VALUES (
  '00000000-0000-0000-0000-000000664017', DATE '2013-04-02', '{"AKC":"664-OWNER"}'::jsonb
);
INSERT INTO public.people_private (person_id, date_of_birth, junior_handler_numbers)
VALUES (
  '00000000-0000-0000-0000-000000664016', DATE '2011-04-02', '{"AKC":"664-DELETED"}'::jsonb
);
INSERT INTO public.entries (id, show_id, handler_id, entry_status, payment_status)
VALUES (
  '00000000-0000-0000-0000-000000664009',
  '00000000-0000-0000-0000-000000664003',
  '00000000-0000-0000-0000-000000664016',
  'confirmed', 'paid'
);

DO $$
DECLARE
  handler_id uuid := '00000000-0000-0000-0000-000000664014';
  empty_person uuid := '00000000-0000-0000-0000-000000664018';
  related_manager uuid := '00000000-0000-0000-0000-000000664101';
  unrelated_manager uuid := '00000000-0000-0000-0000-000000664102';
  exhibitor uuid := '00000000-0000-0000-0000-000000664103';
  self_auth uuid := '00000000-0000-0000-0000-000000664104';
  site_admin uuid := '00000000-0000-0000-0000-000000664105';
  deleted_handler uuid := '00000000-0000-0000-0000-000000664016';
  visible_rows integer;
  writes_denied boolean;
  response jsonb;
  private_dob date;
  private_numbers jsonb;
  public_phone text;
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
  IF NOT has_table_privilege('authenticated', 'public.people_private', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated lost people_private table SELECT';
  END IF;
  IF has_table_privilege('authenticated', 'public.people_private', 'INSERT')
     OR has_table_privilege('authenticated', 'public.people_private', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.people_private', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL authenticated retained direct people_private write access';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_people_private(uuid[])', 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute get_people_private';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.update_person_with_private(uuid,jsonb,jsonb)', 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute update_person_with_private';
  END IF;
  IF has_column_privilege('anon', 'public.people', 'date_of_birth', 'SELECT')
     OR has_column_privilege('anon', 'public.people', 'junior_handler_numbers', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon can read legacy private people columns';
  END IF;

  SET LOCAL ROLE authenticated;

  -- Self: subject can read and write their own private row.
  PERFORM set_config('request.jwt.claim.sub', self_auth::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', self_auth, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[handler_id]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL self cannot read private profile'; END IF;

  -- Legacy deployed clients still write public.people during the expand phase;
  -- the compatibility trigger must keep the private boundary in sync.
  UPDATE public.people
  SET date_of_birth = DATE '2012-04-01',
      junior_handler_numbers = '{"AKC":"664-LEGACY"}'::jsonb
  WHERE id = handler_id;
  SELECT date_of_birth, junior_handler_numbers
  INTO private_dob, private_numbers
  FROM public.people_private
  WHERE person_id = handler_id;
  IF private_dob IS DISTINCT FROM DATE '2012-04-01'
     OR private_numbers IS DISTINCT FROM '{"AKC":"664-LEGACY"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL legacy people write did not synchronize people_private';
  END IF;

  PERFORM public.update_person_with_private(
    handler_id,
    '{"phone":"self-save"}'::jsonb,
    '{"date_of_birth":"2012-04-03","junior_handler_numbers":{"AKC":"664-JR-2"}}'::jsonb
  );
  SELECT date_of_birth, junior_handler_numbers, phone
  INTO private_dob, private_numbers, public_phone
  FROM public.people
  WHERE id = handler_id;
  IF private_dob IS DISTINCT FROM DATE '2012-04-03'
     OR private_numbers IS DISTINCT FROM '{"AKC":"664-JR-2"}'::jsonb
     OR public_phone IS DISTINCT FROM 'self-save' THEN
    RAISE EXCEPTION 'FAIL private RPC write did not synchronize legacy people columns';
  END IF;

  writes_denied := false;
  BEGIN
    PERFORM public.update_person_with_private(
      handler_id,
      '{"phone":"should-rollback"}'::jsonb,
      '{"junior_handler_numbers":{"AKC":42}}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    writes_denied := true;
  END;
  IF NOT writes_denied THEN RAISE EXCEPTION 'FAIL invalid private patch was accepted'; END IF;
  SELECT phone, date_of_birth, junior_handler_numbers
  INTO public_phone, private_dob, private_numbers
  FROM public.people
  WHERE id = handler_id;
  IF public_phone IS DISTINCT FROM 'self-save'
     OR private_dob IS DISTINCT FROM DATE '2012-04-03'
     OR private_numbers IS DISTINCT FROM '{"AKC":"664-JR-2"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL atomic public/private transaction did not roll back';
  END IF;

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
  PERFORM public.update_person_with_private(
    handler_id,
    '{}'::jsonb,
    '{"junior_handler_numbers":null}'::jsonb
  );
  SELECT junior_handler_numbers INTO private_numbers
  FROM public.people_private
  WHERE person_id = handler_id;
  IF private_numbers IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL JSON null junior-number patch did not clear existing values';
  END IF;

  -- Self access remains complete even when no private row was materialized.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000664108', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000664108', 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[empty_person]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL self cannot read an authorized empty private profile'; END IF;
  SELECT date_of_birth, junior_handler_numbers INTO private_dob, private_numbers
  FROM public.get_people_private(ARRAY[empty_person]);
  IF private_dob IS NOT NULL OR private_numbers IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL authorized empty private profile was not returned as empty';
  END IF;

  -- Related manager: entry -> show -> managed club is the only manager read arm.
  PERFORM set_config('request.jwt.claim.sub', related_manager::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', related_manager, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[handler_id]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL related show manager cannot read private profile'; END IF;
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY['00000000-0000-0000-0000-000000664017'::uuid]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL owner fallback handler cannot read private profile'; END IF;
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[empty_person]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL manager cannot read an authorized empty private profile'; END IF;
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[deleted_handler]);
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'FAIL manager can read a soft-deleted handler profile'; END IF;
  PERFORM public.update_person_with_private(handler_id, '{"phone":"manager-save"}'::jsonb, '{}'::jsonb);
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
  IF NOT writes_denied THEN
    RAISE EXCEPTION 'FAIL related show manager can atomically write private profile';
  END IF;

  SELECT public.update_person_with_private(
    '00000000-0000-0000-0000-000000664019',
    '{"phone":"manager-save-hidden"}'::jsonb,
    '{}'::jsonb
  ) INTO response;
  IF response ? 'date_of_birth' OR response ? 'junior_handler_numbers' THEN
    RAISE EXCEPTION 'FAIL manager RPC response exposed unrelated private fields';
  END IF;

  -- A manager may create a directory person with the legacy private fields
  -- empty. Non-empty private data remains subject/site-admin only.
  INSERT INTO public.people (id, first_name, last_name, auth_user_id)
  VALUES (
    '00000000-0000-0000-0000-000000664020', 'Manager', 'Created', NULL
  );
  IF EXISTS (
    SELECT 1 FROM public.people_private
    WHERE person_id = '00000000-0000-0000-0000-000000664020'
  ) THEN
    RAISE EXCEPTION 'FAIL empty manager-created person materialized a private row';
  END IF;

  writes_denied := false;
  BEGIN
    INSERT INTO public.people (
      id, first_name, last_name, auth_user_id, date_of_birth
    ) VALUES (
      '00000000-0000-0000-0000-000000664021', 'Manager', 'Private', NULL,
      DATE '2012-04-04'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    writes_denied := true;
  END;
  IF NOT writes_denied THEN
    RAISE EXCEPTION 'FAIL manager-created non-empty private fields were accepted';
  END IF;

  writes_denied := false;
  BEGIN
    UPDATE public.people
    SET date_of_birth = DATE '2012-04-04'
    WHERE id = handler_id;
  EXCEPTION WHEN insufficient_privilege THEN
    writes_denied := true;
  END;
  IF NOT writes_denied THEN
    RAISE EXCEPTION 'FAIL related manager can write legacy private columns';
  END IF;

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
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[empty_person]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL site admin cannot read an authorized empty private profile'; END IF;
  SELECT count(*) INTO visible_rows FROM public.get_people_private(ARRAY[deleted_handler]);
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'FAIL site admin cannot read deleted-person private details'; END IF;
  PERFORM public.update_person_with_private(
    handler_id,
    '{}'::jsonb,
    '{"date_of_birth":"2012-04-05","junior_handler_numbers":{"AKC":"664-JR-5"}}'::jsonb
  );

  writes_denied := false;
  BEGIN
    PERFORM public.update_person_with_private(
      deleted_handler,
      '{}'::jsonb,
      '{"date_of_birth":"2012-04-06"}'::jsonb
    );
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
