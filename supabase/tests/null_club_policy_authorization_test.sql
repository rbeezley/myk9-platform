-- MYK9-585: a club-less show must not be readable or writable by every club
-- admin / club secretary on the platform THROUGH AN RLS POLICY.
--
-- null_club_show_authorization_test.sql (MYK9-258) proves the same property for
-- the SQL FUNCTIONS (manageable_show_ids, can_manage_show, ...). Nobody had
-- exercised the RLS policies that call is_club_admin(club_id) /
-- is_trial_secretary(club_id) DIRECTLY. 20260916015300 guards sixteen of them;
-- this file is the behavioural half.
--
-- WHY THE CLUB-LESS SHOWS HERE ARE 'published'. `shows_select` has carried the
-- `club_id IS NOT NULL` guard since 20260823190000, so a club admin cannot see a
-- DRAFT club-less show at all — and an UPDATE's row scan is filtered by the
-- SELECT policies, which would make an UPDATE-row-count assertion pass against
-- the VULNERABLE policy too. `shows_select`'s public arm
-- (`status IN ('published', ...)`) is what makes the row visible to everyone,
-- and it is exactly the live shape: two of the three club-less shows on the
-- linked database are 'published'. So the write policies are the only gate on
-- these rows, which is what this file must exercise. A DRAFT club-less show is
-- used only where the public status arm is the thing being isolated
-- (trials_select / classes_select).
--
-- Every case asserts BOTH directions. A test that only proved the club-less row
-- is hidden would also pass if the guard hid everything — a worse bug the other
-- way — so each block reads its own club's row first.
--
-- The DELETE case uses its OWN club-less show. Pointing it at the shared one
-- made every later case pass vacuously against the vulnerable policy set: the
-- delete succeeded, and "the row is not visible" is trivially true of a row that
-- no longer exists. Found by replaying this file's assertions against the
-- pre-migration predicates on a throwaway local Postgres.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/null_club_policy_authorization_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000585001', 'MYK9-585 Club A');

-- People FIRST, carrying an email and a NULL auth link: handle_new_user() adopts
-- an existing person by LOWER(email) when auth.users is inserted. Setting
-- people.auth_user_id directly looks equivalent and is not — the trigger would
-- then INSERT a fresh people row and collide with people_auth_user_id_key.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000585011', 'MYK9-585', 'Club Admin A',
   'myk9-585-club-admin-a@example.test', NULL),
  ('00000000-0000-0000-0000-000000585012', 'MYK9-585', 'Secretary A',
   'myk9-585-secretary-a@example.test', NULL),
  ('00000000-0000-0000-0000-000000585013', 'MYK9-585', 'Site Admin',
   'myk9-585-site-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000000585014', 'MYK9-585', 'Exhibitor',
   'myk9-585-exhibitor@example.test', NULL);

-- show_message_threads.participant_id and show_messages.sender_id are FKs to
-- auth.users, so these identities must exist before any thread or message.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
VALUES
  ('00000000-0000-0000-0000-000000585101','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','myk9-585-club-admin-a@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-000000585102','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','myk9-585-secretary-a@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-000000585103','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','myk9-585-site-admin@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-000000585104','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','myk9-585-exhibitor@example.test','', now(), now(), now(), '{}','{}', false, false, false);

-- Guard the assumption every identity below rests on.
DO $adopt$
BEGIN
  IF (SELECT auth_user_id FROM public.people WHERE id = '00000000-0000-0000-0000-000000585011')
     IS DISTINCT FROM '00000000-0000-0000-0000-000000585101'::uuid THEN
    RAISE EXCEPTION 'FAIL 0.0 handle_new_user did not adopt the seeded person by email';
  END IF;
  RAISE NOTICE 'PASS 0.0 seeded people adopted by handle_new_user';
END $adopt$;

-- is_trial_secretary additionally requires active club membership.
INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  ('00000000-0000-0000-0000-000000585001', '00000000-0000-0000-0000-000000585011', 'active'),
  ('00000000-0000-0000-0000-000000585001', '00000000-0000-0000-0000-000000585012', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000585011', id, '00000000-0000-0000-0000-000000585001', true,
       '00000000-0000-0000-0000-000000585101'
FROM public.roles WHERE name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000585012', id, '00000000-0000-0000-0000-000000585001', true,
       '00000000-0000-0000-0000-000000585102'
FROM public.roles WHERE name = 'secretary';

-- Site admin: no club scope at all, and the only identity that should reach a
-- club-less row after this change.
INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000585013', id, true, '00000000-0000-0000-0000-000000585103'
FROM public.roles WHERE name = 'site_admin';

-- enforce_show_publish_gate / enforce_show_club_authorization both carve out any
-- session whose `role` GUC is not 'authenticated'/'anon', so these fixture rows
-- (running as the migration owner) insert 'published' without tripping MK003/MK004.
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  ('00000000-0000-0000-0000-000000585021', 'MYK9-585 Club A Show', 'AKC',
   current_date, current_date + 1, 'published', '00000000-0000-0000-0000-000000585001'),
  ('00000000-0000-0000-0000-000000585022', 'MYK9-585 Club-less Published Show', 'AKC',
   current_date, current_date + 1, 'published', NULL),
  ('00000000-0000-0000-0000-000000585023', 'MYK9-585 Club-less Draft Show', 'AKC',
   current_date, current_date + 1, 'draft', NULL),
  ('00000000-0000-0000-0000-000000585024', 'MYK9-585 Club-less Delete Target', 'AKC',
   current_date, current_date + 1, 'published', NULL);

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000585031', '00000000-0000-0000-0000-000000585021',
   'MYK9-585 Club A Trial', current_date),
  -- Under the DRAFT club-less show: trials_select's public arm cannot reach it,
  -- so only the club arm is under test here.
  ('00000000-0000-0000-0000-000000585032', '00000000-0000-0000-0000-000000585023',
   'MYK9-585 Club-less Draft Trial', current_date),
  -- Under the PUBLISHED club-less show: visible to everyone, so the visibility
  -- override policies are the only gate on writing to it.
  ('00000000-0000-0000-0000-000000585033', '00000000-0000-0000-0000-000000585022',
   'MYK9-585 Club-less Published Trial', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000585041', '00000000-0000-0000-0000-000000585031', 'Container Novice'),
  ('00000000-0000-0000-0000-000000585042', '00000000-0000-0000-0000-000000585032', 'Container Novice'),
  ('00000000-0000-0000-0000-000000585043', '00000000-0000-0000-0000-000000585033', 'Container Novice');

INSERT INTO public.show_message_threads (id, show_id, participant_id)
VALUES
  ('00000000-0000-0000-0000-000000585051', '00000000-0000-0000-0000-000000585021',
   '00000000-0000-0000-0000-000000585104'),
  ('00000000-0000-0000-0000-000000585052', '00000000-0000-0000-0000-000000585022',
   '00000000-0000-0000-0000-000000585104');

INSERT INTO public.show_messages (id, show_id, thread_id, sender_id, body)
VALUES
  ('00000000-0000-0000-0000-000000585061', '00000000-0000-0000-0000-000000585021',
   '00000000-0000-0000-0000-000000585051', '00000000-0000-0000-0000-000000585104',
   'MYK9-585 CLUB A BODY'),
  ('00000000-0000-0000-0000-000000585062', '00000000-0000-0000-0000-000000585022',
   '00000000-0000-0000-0000-000000585052', '00000000-0000-0000-0000-000000585104',
   'MYK9-585 CLUB-LESS BODY');

-- ---------------------------------------------------------------------------
-- 1. The club admin of club A. Every assertion below reached the club-less row
--    before 20260916015300, because is_club_admin(NULL) answers "club admin
--    anywhere?".
-- ---------------------------------------------------------------------------
DO $case1$
DECLARE
  n integer;
  refused boolean;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000585101', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000585101', 'role', 'authenticated')::text,
    true
  );

  UPDATE public.shows SET name = name WHERE id = '00000000-0000-0000-0000-000000585021';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 1.0 club admin lost UPDATE on their own club''s show';
  END IF;
  RAISE NOTICE 'PASS 1.0 club admin still updates their own club''s show';

  UPDATE public.shows SET name = name WHERE id = '00000000-0000-0000-0000-000000585022';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 1.1 shows_update reached a club-less show (MYK9-585)';
  END IF;
  RAISE NOTICE 'PASS 1.1 shows_update refuses a club-less show';

  DELETE FROM public.shows WHERE id = '00000000-0000-0000-0000-000000585024';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 1.2 shows_delete reached a club-less show (MYK9-585)';
  END IF;
  RAISE NOTICE 'PASS 1.2 shows_delete refuses a club-less show';

  refused := false;
  BEGIN
    INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
    VALUES ('00000000-0000-0000-0000-000000585025', 'MYK9-585 Forged Club-less', 'AKC',
            current_date, current_date + 1, 'draft', NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL 1.3 shows_insert accepted a club-less show (MYK9-585)';
  END IF;
  RAISE NOTICE 'PASS 1.3 shows_insert refuses a club-less show';

  -- Non-vacuity for 1.3: the same INSERT scoped to their own club must succeed,
  -- or "refused" above would prove only that shows_insert is broken for everyone.
  INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
  VALUES ('00000000-0000-0000-0000-000000585026', 'MYK9-585 Own Club Show', 'AKC',
          current_date, current_date + 1, 'draft', '00000000-0000-0000-0000-000000585001');
  RAISE NOTICE 'PASS 1.4 shows_insert still accepts a show in the admin''s own club';

  RESET ROLE;
END $case1$;

-- ---------------------------------------------------------------------------
-- 2. Read scope: trials_select / classes_select. The DRAFT club-less show is
--    used here so the public status arm cannot mask the club arm.
-- ---------------------------------------------------------------------------
DO $case2$
DECLARE n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000585101', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000585101', 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO n FROM public.trials WHERE id = '00000000-0000-0000-0000-000000585031';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 2.0 trials_select lost the club admin their own club''s trial';
  END IF;
  SELECT count(*) INTO n FROM public.trials WHERE id = '00000000-0000-0000-0000-000000585032';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 2.1 trials_select exposed a club-less draft trial (MYK9-585)';
  END IF;
  RAISE NOTICE 'PASS 2.x trials_select is club-scoped';

  SELECT count(*) INTO n FROM public.classes WHERE id = '00000000-0000-0000-0000-000000585041';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 3.0 classes_select lost the club admin their own club''s class';
  END IF;
  SELECT count(*) INTO n FROM public.classes WHERE id = '00000000-0000-0000-0000-000000585042';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 3.1 classes_select exposed a club-less draft class (MYK9-585)';
  END IF;
  RAISE NOTICE 'PASS 3.x classes_select is club-scoped';

  RESET ROLE;
END $case2$;

-- ---------------------------------------------------------------------------
-- 3. Private correspondence: threads_select / messages_select. The club admin is
--    not a participant on either thread, so the show-staff arm is the only route.
-- ---------------------------------------------------------------------------
DO $case3$
DECLARE n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000585101', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000585101', 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO n FROM public.show_message_threads
   WHERE id = '00000000-0000-0000-0000-000000585051';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 4.0 threads_select lost the club admin their own club''s thread';
  END IF;
  SELECT count(*) INTO n FROM public.show_message_threads
   WHERE id = '00000000-0000-0000-0000-000000585052';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 4.1 threads_select exposed a club-less show''s thread (MYK9-585)';
  END IF;

  SELECT count(*) INTO n FROM public.show_messages
   WHERE id = '00000000-0000-0000-0000-000000585061';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 4.2 messages_select lost the club admin their own club''s message';
  END IF;
  SELECT count(*) INTO n FROM public.show_messages
   WHERE id = '00000000-0000-0000-0000-000000585062';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 4.3 messages_select exposed a club-less show''s message (MYK9-585)';
  END IF;
  RAISE NOTICE 'PASS 4.x threads/messages are club-scoped';

  RESET ROLE;
END $case3$;

-- ---------------------------------------------------------------------------
-- 4. The visibility-override write surfaces. Their targets all hang off the
--    PUBLISHED club-less show, so every EXISTS subquery in the policy can see
--    its row and the club arm is the only thing being tested.
-- ---------------------------------------------------------------------------
DO $case4$
DECLARE refused boolean;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000585101', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000585101', 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.show_visibility_settings (show_id)
  VALUES ('00000000-0000-0000-0000-000000585021');
  refused := false;
  BEGIN
    INSERT INTO public.show_visibility_settings (show_id)
    VALUES ('00000000-0000-0000-0000-000000585022');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL 5.0 show_visibility_insert accepted a club-less show (MYK9-585)';
  END IF;

  INSERT INTO public.trial_visibility_overrides (trial_id)
  VALUES ('00000000-0000-0000-0000-000000585031');
  refused := false;
  BEGIN
    INSERT INTO public.trial_visibility_overrides (trial_id)
    VALUES ('00000000-0000-0000-0000-000000585033');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL 5.1 trial_visibility_insert accepted a club-less show (MYK9-585)';
  END IF;

  INSERT INTO public.class_visibility_overrides (class_id)
  VALUES ('00000000-0000-0000-0000-000000585041');
  refused := false;
  BEGIN
    INSERT INTO public.class_visibility_overrides (class_id)
    VALUES ('00000000-0000-0000-0000-000000585043');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'FAIL 5.2 class_visibility_insert accepted a club-less show (MYK9-585)';
  END IF;
  RAISE NOTICE 'PASS 5.x visibility overrides are club-scoped (own-club writes all succeeded)';

  RESET ROLE;
END $case4$;

-- ---------------------------------------------------------------------------
-- 5. The club SECRETARY — the second arm, a separate helper with the same
--    NULL-wildcard collapse.
-- ---------------------------------------------------------------------------
DO $case5$
DECLARE n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000585102', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000585102', 'role', 'authenticated')::text,
    true
  );

  UPDATE public.shows SET name = name WHERE id = '00000000-0000-0000-0000-000000585021';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 6.0 club secretary lost UPDATE on their own club''s show';
  END IF;
  UPDATE public.shows SET name = name WHERE id = '00000000-0000-0000-0000-000000585022';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 6.1 shows_update reached a club-less show for a secretary (MYK9-585)';
  END IF;

  SELECT count(*) INTO n FROM public.trials WHERE id = '00000000-0000-0000-0000-000000585032';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 6.2 trials_select exposed a club-less draft trial to a secretary (MYK9-585)';
  END IF;

  SELECT count(*) INTO n FROM public.show_message_threads
   WHERE id = '00000000-0000-0000-0000-000000585052';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 6.3 threads_select exposed a club-less thread to a secretary (MYK9-585)';
  END IF;
  RAISE NOTICE 'PASS 6.x the secretary arm is club-scoped too';

  RESET ROLE;
END $case5$;

-- ---------------------------------------------------------------------------
-- 6. The site admin must STILL reach the club-less show. Without this the whole
--    file would pass against a change that simply hid club-less rows from
--    everyone, which is the opposite failure.
-- ---------------------------------------------------------------------------
DO $case6$
DECLARE n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000585103', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000585103', 'role', 'authenticated')::text,
    true
  );

  UPDATE public.shows SET name = name WHERE id = '00000000-0000-0000-0000-000000585022';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 7.0 site admin lost UPDATE on the club-less show';
  END IF;
  RAISE NOTICE 'PASS 7.0 site admin still updates the club-less show';

  SELECT count(*) INTO n FROM public.trials WHERE id = '00000000-0000-0000-0000-000000585032';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 7.1 site admin lost the club-less draft trial';
  END IF;
  RAISE NOTICE 'PASS 7.1 site admin still reads the club-less draft trial';

  RESET ROLE;
END $case6$;

ROLLBACK;
