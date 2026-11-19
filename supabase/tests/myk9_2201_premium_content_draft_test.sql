-- MYK9-2201: public.show_premium_drafts keeps the secretary's premium edits for managers only
-- (20261119235300).
--   1. A show manager (club admin) writes and reads a draft; saved_at and updated_by are stamped by
--      the server whatever the client sends; an unrelated change keeps nothing but the stamp rule.
--   2. Another club's admin, a plain member and an exhibitor read 0 rows and cannot write.
--   3. anon has no privilege and reads nothing.
--   4. The draft is not a publication field: published_premium_at stays untouched.
--   5. Deleting the show removes its draft (the hard_delete_show manifest edge is CASCADE).
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000220101', 'Premium Draft Club'),
  ('00000000-0000-0000-0000-000000220102', 'Premium Draft Other Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000220103', 'Premium Draft Show', 'AKC',
  CURRENT_DATE + 30, CURRENT_DATE + 31, '00000000-0000-0000-0000-000000220101', 'published'
);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000220111', 'Draft', 'Admin', 'myk9-2201-admin@example.test'),
  ('00000000-0000-0000-0000-000000220112', 'Draft', 'OtherAdmin', 'myk9-2201-other@example.test'),
  ('00000000-0000-0000-0000-000000220113', 'Draft', 'Member', 'myk9-2201-member@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000220601', 'myk9-2201-admin@example.test'),
  ('00000000-0000-0000-0000-000000220602', 'myk9-2201-other@example.test'),
  ('00000000-0000-0000-0000-000000220603', 'myk9-2201-member@example.test')
) AS v(id, email);

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES ('00000000-0000-0000-0000-000000220101', '00000000-0000-0000-0000-000000220113', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, r.id, fixture.club_id, true, fixture.auth_id
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000220111'::uuid, '00000000-0000-0000-0000-000000220601'::uuid,
     '00000000-0000-0000-0000-000000220101'::uuid, 'club_admin'),
    ('00000000-0000-0000-0000-000000220112'::uuid, '00000000-0000-0000-0000-000000220602'::uuid,
     '00000000-0000-0000-0000-000000220102'::uuid, 'club_admin')
) AS fixture(person_id, auth_id, club_id, role_name)
JOIN public.roles r ON r.name = fixture.role_name;

-- 1. A manager writes and reads; the server stamps saved_at and updated_by.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000220601', true);

DO $$
DECLARE
  d record;
BEGIN
  INSERT INTO public.show_premium_drafts (show_id, content, saved_at, updated_by)
  VALUES ('00000000-0000-0000-0000-000000220103', '{"narratives":{"showHours":"7am"}}',
          '2001-01-01T00:00:00Z', '00000000-0000-0000-0000-000000220699');
  SELECT * INTO d FROM public.show_premium_drafts
   WHERE show_id = '00000000-0000-0000-0000-000000220103';
  IF d.saved_at < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'FAIL 1 saved_at must be the server time, got %', d.saved_at;
  END IF;
  IF d.updated_by IS DISTINCT FROM '00000000-0000-0000-0000-000000220601'::uuid THEN
    RAISE EXCEPTION 'FAIL 1 updated_by must be the caller, got %', d.updated_by;
  END IF;
  UPDATE public.show_premium_drafts SET content = '{}'
   WHERE show_id = '00000000-0000-0000-0000-000000220103';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL 1 the manager could not update the draft'; END IF;
  RAISE NOTICE 'PASS 1 a manager writes, updates and reads a draft; the server stamps it';
END;
$$;

-- 2. Another club's admin and a plain member see and write nothing; an exhibitor (no roles) too.
DO $$
DECLARE
  who record;
  n integer;
BEGIN
  FOR who IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000220602', 'another club''s admin'),
      ('00000000-0000-0000-0000-000000220603', 'member'),
      ('00000000-0000-0000-0000-000000220699', 'exhibitor')
    ) AS v(auth_id, label)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', who.auth_id, true);
    SELECT count(*) INTO n FROM public.show_premium_drafts;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL 2 % read % draft row(s)', who.label, n; END IF;
    UPDATE public.show_premium_drafts SET content = '{"narratives":{"showHours":"hijack"}}';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL 2 % updated % draft row(s)', who.label, n; END IF;
    BEGIN
      INSERT INTO public.show_premium_drafts (show_id, content)
      VALUES ('00000000-0000-0000-0000-000000220103', '{}');
      RAISE EXCEPTION 'FAIL 2 % inserted a draft', who.label;
    EXCEPTION WHEN insufficient_privilege OR unique_violation THEN
      IF SQLSTATE = '23505' THEN
        RAISE EXCEPTION 'FAIL 2 % got past the insert policy', who.label;
      END IF;
    END;
  END LOOP;
  RAISE NOTICE 'PASS 2 non-managers read 0 rows and cannot write';
END;
$$;

-- 3. anon has no privilege.
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.show_premium_drafts;
    RAISE EXCEPTION 'FAIL 3 anon could read show_premium_drafts';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 3 anon has no access';
END;
$$;
RESET ROLE;

-- 4. A draft publishes nothing.
DO $$
BEGIN
  IF (SELECT published_premium_at FROM public.shows
       WHERE id = '00000000-0000-0000-0000-000000220103') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 4 a draft must not publish anything';
  END IF;
  RAISE NOTICE 'PASS 4 a draft never touches publication state';
END;
$$;

-- 5. The draft goes with the show.
DO $$
BEGIN
  DELETE FROM public.shows WHERE id = '00000000-0000-0000-0000-000000220103';
  IF EXISTS (SELECT 1 FROM public.show_premium_drafts
              WHERE show_id = '00000000-0000-0000-0000-000000220103') THEN
    RAISE EXCEPTION 'FAIL 5 the draft outlived its show';
  END IF;
  RAISE NOTICE 'PASS 5 the draft is removed with its show';
END;
$$;

ROLLBACK;
