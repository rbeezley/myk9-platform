-- MYK9-941 behavioral contract: dog_registrations INSERT/UPDATE/DELETE
-- (20261003002747_myk9_941_dog_registrations_co_owner_writes.sql).
--
--   * the dog's CO-OWNER may insert, update and delete its registrations (the fix);
--   * the owner, a secretary (has_role('secretary')) and a site admin still may;
--   * an unrelated exhibitor and a club admin without the secretary role may not.
--
-- Note on the baseline: the repo's own migration chain carried the co-owner arm
-- (016) but not the secretary/site-admin arms, which were added live by an
-- uncommitted migration 154 that also dropped the co-owner arm. A from-scratch CI
-- database therefore differed from production in the OTHER direction; this test
-- pins the combined contract so the two can no longer drift apart unnoticed.
--
-- The club-admin denials are paired with a positive SELECT control: a club admin
-- can READ the registration (dogs_select via is_show_manager()), so a zero-row
-- UPDATE/DELETE proves the write policy refused it, not that the row was invisible.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('secretary', 'MYK9-941 fixture', true),
  ('club_admin', 'MYK9-941 fixture', true),
  ('site_admin', 'MYK9-941 fixture', true),
  ('exhibitor', 'MYK9-941 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000941001', 'MYK9-941 Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000941011', 'MYK9-941', 'Owner',     'myk9-941-owner@example.test',     NULL),
  ('00000000-0000-0000-0000-000000941012', 'MYK9-941', 'CoOwner',   'myk9-941-coowner@example.test',   NULL),
  ('00000000-0000-0000-0000-000000941013', 'MYK9-941', 'Secretary', 'myk9-941-secretary@example.test', NULL),
  ('00000000-0000-0000-0000-000000941014', 'MYK9-941', 'SiteAdmin', 'myk9-941-admin@example.test',     NULL),
  ('00000000-0000-0000-0000-000000941015', 'MYK9-941', 'Unrelated', 'myk9-941-unrelated@example.test', NULL),
  ('00000000-0000-0000-0000-000000941016', 'MYK9-941', 'ClubAdmin', 'myk9-941-clubadmin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000941101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-941-owner@example.test',     '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000941102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-941-coowner@example.test',   '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000941103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-941-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000941104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-941-admin@example.test',     '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000941105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-941-unrelated@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000941106', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-941-clubadmin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000941011'::uuid, '00000000-0000-0000-0000-000000941101'::uuid),
  ('00000000-0000-0000-0000-000000941012'::uuid, '00000000-0000-0000-0000-000000941102'::uuid),
  ('00000000-0000-0000-0000-000000941013'::uuid, '00000000-0000-0000-0000-000000941103'::uuid),
  ('00000000-0000-0000-0000-000000941014'::uuid, '00000000-0000-0000-0000-000000941104'::uuid),
  ('00000000-0000-0000-0000-000000941015'::uuid, '00000000-0000-0000-0000-000000941105'::uuid),
  ('00000000-0000-0000-0000-000000941016'::uuid, '00000000-0000-0000-0000-000000941106'::uuid)
) AS fixture(person_id, auth_id)
WHERE person.id = fixture.person_id;

-- Club-wide secretary and club admin for the same club; platform-wide site admin
-- and exhibitor. None of the staff owns or co-owns the dog.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000941013', roles.id, '00000000-0000-0000-0000-000000941001',
       true, '00000000-0000-0000-0000-000000941103'
FROM public.roles WHERE roles.name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000941016', roles.id, '00000000-0000-0000-0000-000000941001',
       true, '00000000-0000-0000-0000-000000941106'
FROM public.roles WHERE roles.name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000941014', roles.id, true, '00000000-0000-0000-0000-000000941104'
FROM public.roles WHERE roles.name = 'site_admin';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000941015', roles.id, true, '00000000-0000-0000-0000-000000941105'
FROM public.roles WHERE roles.name = 'exhibitor';

INSERT INTO public.dogs (id, call_name, breed, owner_id, co_owner_id)
VALUES ('00000000-0000-0000-0000-000000941051', 'MYK9-941 Dog', 'Labrador Retriever',
        '00000000-0000-0000-0000-000000941011', '00000000-0000-0000-0000-000000941012');

-- The standing registration every actor tries to UPDATE and (negative actors) DELETE.
INSERT INTO public.dog_registrations (id, dog_id, organization, registration_number)
VALUES ('00000000-0000-0000-0000-000000941061', '00000000-0000-0000-0000-000000941051', 'AKC', 'MYK9941000');

DO $$
DECLARE
  v_dog    uuid := '00000000-0000-0000-0000-000000941051';
  standing uuid := '00000000-0000-0000-0000-000000941061';
  actor record;
  new_reg uuid;
  n integer;
BEGIN
  ------------------------------------------------------------------
  -- Allowed: co-owner (the fix), owner, secretary, site admin. Each inserts a UKC
  -- registration, updates it, updates the standing AKC row, then deletes its UKC
  -- row (so the next actor's UKC insert does not hit the one-live-org-per-dog index).
  ------------------------------------------------------------------
  FOR actor IN
    SELECT * FROM (VALUES
      (1, 'co-owner',   '00000000-0000-0000-0000-000000941102'::uuid),
      (2, 'owner',      '00000000-0000-0000-0000-000000941101'::uuid),
      (3, 'secretary',  '00000000-0000-0000-0000-000000941103'::uuid),
      (4, 'site admin', '00000000-0000-0000-0000-000000941104'::uuid)
    ) AS a(ord, label, auth_id)
    ORDER BY ord
  LOOP
    new_reg := ('00000000-0000-0000-0000-00000094107' || actor.ord)::uuid;

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', actor.auth_id::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', actor.auth_id, 'role', 'authenticated')::text, true);

    BEGIN
      INSERT INTO public.dog_registrations (id, dog_id, organization, registration_number)
      VALUES (new_reg, v_dog, 'UKC', 'MYK9941U' || actor.ord);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'FAIL % could not INSERT a registration for the dog (%): %',
        actor.label, SQLSTATE, SQLERRM;
    END;

    UPDATE public.dog_registrations SET registration_number = 'MYK9941V' || actor.ord
    WHERE id = new_reg;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'FAIL % updated % of 1 registration row it just inserted', actor.label, n;
    END IF;

    UPDATE public.dog_registrations SET registered_name = 'MYK9-941 ' || actor.label
    WHERE id = standing;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'FAIL % updated % of 1 standing registration row', actor.label, n;
    END IF;

    DELETE FROM public.dog_registrations WHERE id = new_reg;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'FAIL % deleted % of 1 registration row', actor.label, n;
    END IF;

    RESET ROLE;

    SELECT count(*) INTO n FROM public.dog_registrations
    WHERE id = standing AND registered_name = 'MYK9-941 ' || actor.label;
    IF n <> 1 THEN
      RAISE EXCEPTION 'FAIL % update of the standing registration did not persist', actor.label;
    END IF;
  END LOOP;

  ------------------------------------------------------------------
  -- Refused: an unrelated exhibitor and a club admin without the secretary role.
  ------------------------------------------------------------------
  UPDATE public.dog_registrations SET registered_name = 'MYK9-941 baseline' WHERE id = standing;

  FOR actor IN
    SELECT * FROM (VALUES
      (5, 'unrelated exhibitor', '00000000-0000-0000-0000-000000941105'::uuid, false),
      (6, 'club admin',          '00000000-0000-0000-0000-000000941106'::uuid, true)
    ) AS a(ord, label, auth_id, can_read)
    ORDER BY ord
  LOOP
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', actor.auth_id::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', actor.auth_id, 'role', 'authenticated')::text, true);

    -- Positive control for the club admin: the row is visible, so a zero-row
    -- write below is the write policy's refusal, not invisibility.
    SELECT count(*) INTO n FROM public.dog_registrations WHERE id = standing;
    IF actor.can_read AND n <> 1 THEN
      RAISE EXCEPTION 'FAIL % could not read the standing registration (control); '
        'the write denials below would prove nothing', actor.label;
    END IF;

    BEGIN
      INSERT INTO public.dog_registrations (id, dog_id, organization, registration_number)
      VALUES (('00000000-0000-0000-0000-00000094107' || actor.ord)::uuid, v_dog, 'UKC',
              'MYK9941U' || actor.ord);
      RAISE EXCEPTION 'FAIL % INSERTed a registration on a dog it neither owns nor co-owns',
        actor.label;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;

    UPDATE public.dog_registrations SET registered_name = 'MYK9-941 hijack' WHERE id = standing;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'FAIL % UPDATEd % registration row(s) on a dog it neither owns nor co-owns',
        actor.label, n;
    END IF;

    DELETE FROM public.dog_registrations WHERE id = standing;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'FAIL % DELETEd % registration row(s) on a dog it neither owns nor co-owns',
        actor.label, n;
    END IF;

    RESET ROLE;

    SELECT count(*) INTO n FROM public.dog_registrations
    WHERE id = standing AND registered_name = 'MYK9-941 baseline';
    IF n <> 1 THEN
      RAISE EXCEPTION 'FAIL standing registration changed or vanished after % was refused',
        actor.label;
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS MYK9-941: co-owner, owner, secretary and site admin insert, update and '
    'delete a dog''s registrations; an unrelated exhibitor and a club admin (who can read '
    'the row) are refused all three';
END;
$$;

ROLLBACK;
