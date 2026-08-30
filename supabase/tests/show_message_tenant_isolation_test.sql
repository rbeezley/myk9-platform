-- Behavioral cross-tenant test for show message threads and message bodies (F24).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/show_message_tenant_isolation_test.sql
-- All fixtures roll back.
--
-- WHY THIS EXISTS. The secretary task walk found other clubs' show NAMES listed in
-- the Communication History filter, and recorded that it "does not prove message
-- content is isolated: all three load shows have zero messages, so the empty result
-- is unsurprising either way." Reading `threads_select` and `messages_select` says
-- content is scoped, but nothing exercised it — a policy can be correct today and be
-- widened by a later migration with no test to notice. The client fix scopes the
-- filter; this is the part that proves the SERVER does not depend on it.
--
-- Asserts, for a secretary of club A against club B's private thread:
--   * the thread row is invisible,
--   * the message body is invisible,
--   * neither becomes visible by joining from a show the secretary CAN see,
--   * the secretary's own club's thread and message ARE visible (so a test that
--     simply saw nothing would not pass vacuously),
--   * an exhibitor participant sees their own thread and not another exhibitor's.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. Two clubs, each with its own secretary and show. Club B's show
-- carries a private thread the club A secretary must never read.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-00000000aa01', 'Message Isolation Club A'),
  ('00000000-0000-0000-0000-00000000bb01', 'Message Isolation Club B');

-- Order and shape here are dictated by `handle_new_user()`, the trigger on
-- auth.users. It adopts an existing person by matching `LOWER(email)` where
-- `auth_user_id IS NULL`; anything else and it INSERTS a fresh people row carrying
-- the new auth id, which then collides with `people_auth_user_id_key UNIQUE
-- (auth_user_id)`. So people come FIRST, carrying an email and a null auth link, and
-- the trigger fills the link in. Setting `people.auth_user_id` directly looks
-- equivalent and is not -- `people.auth_user_id` has no FK, so nothing objects until
-- the trigger fires.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-00000000aa11', 'Msg', 'Secretary A',
   'msg-secretary-a@example.test', NULL),
  ('00000000-0000-0000-0000-00000000bb11', 'Msg', 'Secretary B',
   'msg-secretary-b@example.test', NULL),
  ('00000000-0000-0000-0000-00000000ee11', 'Msg', 'Exhibitor One',
   'msg-exhibitor-one@example.test', NULL),
  ('00000000-0000-0000-0000-00000000ee12', 'Msg', 'Exhibitor Two',
   'msg-exhibitor-two@example.test', NULL);

-- `show_message_threads.participant_id` and `show_messages.sender_id` are FKs to
-- auth.users, so these identities must exist before any thread or message is inserted.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
VALUES
  ('00000000-0000-0000-0000-00000000aa21','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','msg-secretary-a@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-00000000bb21','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','msg-secretary-b@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-00000000ee21','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','msg-exhibitor-one@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-00000000ee22','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','msg-exhibitor-two@example.test','', now(), now(), now(), '{}','{}', false, false, false);

-- Guard the assumption the rest of the file rests on: if the trigger ever stops
-- adopting by email, every identity below would silently belong to a different person.
DO $adopt$
BEGIN
  IF (SELECT auth_user_id FROM public.people WHERE id = '00000000-0000-0000-0000-00000000aa11')
     IS DISTINCT FROM '00000000-0000-0000-0000-00000000aa21'::uuid THEN
    RAISE EXCEPTION 'FAIL handle_new_user did not adopt the seeded person by email';
  END IF;
END $adopt$;

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000aa11', 'active'),
  ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000bb11', 'active');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-00000000aa11', id, '00000000-0000-0000-0000-00000000aa01', true,
       '00000000-0000-0000-0000-00000000aa21'
FROM public.roles WHERE name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-00000000bb11', id, '00000000-0000-0000-0000-00000000bb01', true,
       '00000000-0000-0000-0000-00000000bb21'
FROM public.roles WHERE name = 'secretary';

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  ('00000000-0000-0000-0000-00000000aa02', 'Club A Show', 'AKC', now(), now(), 'published',
   '00000000-0000-0000-0000-00000000aa01'),
  ('00000000-0000-0000-0000-00000000bb02', 'Club B Show', 'AKC', now(), now(), 'published',
   '00000000-0000-0000-0000-00000000bb01');

INSERT INTO public.show_message_threads (id, show_id, participant_id)
VALUES
  ('00000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-00000000aa02',
   '00000000-0000-0000-0000-00000000ee21'),
  ('00000000-0000-0000-0000-00000000bb03', '00000000-0000-0000-0000-00000000bb02',
   '00000000-0000-0000-0000-00000000ee22');

INSERT INTO public.show_messages (id, show_id, thread_id, sender_id, body)
VALUES
  ('00000000-0000-0000-0000-00000000aa04', '00000000-0000-0000-0000-00000000aa02',
   '00000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-00000000aa21',
   'CLUB A PRIVATE BODY'),
  ('00000000-0000-0000-0000-00000000bb04', '00000000-0000-0000-0000-00000000bb02',
   '00000000-0000-0000-0000-00000000bb03', '00000000-0000-0000-0000-00000000bb21',
   'CLUB B PRIVATE BODY');

DO $$
DECLARE
  sec_a uuid := '00000000-0000-0000-0000-00000000aa21';
  sec_b uuid := '00000000-0000-0000-0000-00000000bb21';
  exh_1 uuid := '00000000-0000-0000-0000-00000000ee21';
  own_threads integer;
  other_threads integer;
  own_bodies integer;
  other_bodies integer;
BEGIN
  -- =========================================================================
  -- Secretary of club A
  -- =========================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', sec_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', sec_a, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO own_threads FROM public.show_message_threads t
   WHERE t.show_id = '00000000-0000-0000-0000-00000000aa02';
  SELECT count(*) INTO other_threads FROM public.show_message_threads t
   WHERE t.show_id = '00000000-0000-0000-0000-00000000bb02';

  -- Non-vacuous: the secretary must actually see their OWN club's thread, or a
  -- policy that hid everything would pass the isolation half.
  IF own_threads <> 1 THEN
    RAISE EXCEPTION 'FAIL club A secretary cannot see their own show thread (got %)', own_threads;
  END IF;
  IF other_threads <> 0 THEN
    RAISE EXCEPTION 'FAIL club A secretary can see club B threads (got %)', other_threads;
  END IF;

  SELECT count(*) INTO own_bodies FROM public.show_messages m
   WHERE m.body = 'CLUB A PRIVATE BODY';
  SELECT count(*) INTO other_bodies FROM public.show_messages m
   WHERE m.body = 'CLUB B PRIVATE BODY';

  IF own_bodies <> 1 THEN
    RAISE EXCEPTION 'FAIL club A secretary cannot read their own message body (got %)', own_bodies;
  END IF;
  IF other_bodies <> 0 THEN
    RAISE EXCEPTION 'FAIL club A secretary read club B message body (got %)', other_bodies;
  END IF;

  -- The client subscribes by show id, so prove a direct thread_id lookup and a
  -- join FROM a visible show do not become a side door into the other tenant.
  SELECT count(*) INTO other_bodies FROM public.show_messages m
   WHERE m.thread_id = '00000000-0000-0000-0000-00000000bb03';
  IF other_bodies <> 0 THEN
    RAISE EXCEPTION 'FAIL club B messages readable by thread id (got %)', other_bodies;
  END IF;

  SELECT count(*) INTO other_bodies
    FROM public.shows s
    JOIN public.show_message_threads t ON t.show_id <> s.id
    JOIN public.show_messages m ON m.thread_id = t.id
   WHERE s.id = '00000000-0000-0000-0000-00000000aa02';
  IF other_bodies <> 0 THEN
    RAISE EXCEPTION 'FAIL club B messages reachable by joining from a visible show (got %)', other_bodies;
  END IF;

  -- =========================================================================
  -- Secretary of club B — the mirror image, so neither direction is special.
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', sec_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', sec_b, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO own_bodies FROM public.show_messages m
   WHERE m.body = 'CLUB B PRIVATE BODY';
  SELECT count(*) INTO other_bodies FROM public.show_messages m
   WHERE m.body = 'CLUB A PRIVATE BODY';

  IF own_bodies <> 1 THEN
    RAISE EXCEPTION 'FAIL club B secretary cannot read their own message body (got %)', own_bodies;
  END IF;
  IF other_bodies <> 0 THEN
    RAISE EXCEPTION 'FAIL club B secretary read club A message body (got %)', other_bodies;
  END IF;

  -- =========================================================================
  -- Exhibitor participant — sees their own thread, not the other exhibitor's.
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', exh_1::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', exh_1, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO own_threads FROM public.show_message_threads t
   WHERE t.participant_id = exh_1;
  SELECT count(*) INTO other_threads FROM public.show_message_threads t
   WHERE t.participant_id <> exh_1;

  IF own_threads <> 1 THEN
    RAISE EXCEPTION 'FAIL exhibitor cannot see their own thread (got %)', own_threads;
  END IF;
  IF other_threads <> 0 THEN
    RAISE EXCEPTION 'FAIL exhibitor can see another participant thread (got %)', other_threads;
  END IF;

  RESET ROLE;
END $$;

ROLLBACK;
