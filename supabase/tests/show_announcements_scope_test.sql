-- MYK9-636: show_announcements mutation policies must be scoped to the
-- announcement's own show, via the shows.club_id predicate that show_messages
-- already carries plus the judge-assignment arm the Message Center's composer
-- has always implied.
--
-- Before 20260917163900 the INSERT policy's only condition was
-- `author_id = auth.uid()`, so ANY authenticated account could post a show-wide
-- announcement onto ANY club's show -- and at priority 'high'/'urgent'
-- `on_announcement_insert_push` fans it out as a web push. UPDATE/DELETE were
-- author-or-platform-admin, so the affected show's own secretary could not
-- remove the stray row.
--
-- Asserts, each with its own positive control so no case can pass by the guard
-- simply refusing everybody:
--
--   1. An exhibitor cannot INSERT an announcement onto a show they do not run
--      (42501 -- the bug).
--   2. A legacy row's non-official author cannot RELOCATE it onto another club's
--      show. This is the UPDATE hole found in review: USING's author arm is
--      show-independent, so without the explicit WITH CHECK the author could
--      `SET show_id = <other club's show>, priority = 'urgent'` and move the
--      push fan-out with it.
--   3. The author arm of DELETE survives: they may still remove their own row.
--   4. A judge ASSIGNED to the show can INSERT on it, edit their own row, and
--      not relocate it; a judge on another show cannot INSERT there, and cannot
--      DELETE somebody else's announcement.
--   5. A club A secretary can INSERT on club A's show and not on club B's.
--   6. That secretary can UPDATE and DELETE an announcement authored by SOMEBODY
--      ELSE on their own show (the arm MYK9-636 reported as missing), cannot
--      relocate their own row, and reaches nothing on club B's show.
--   7. A club-less show (shows.club_id IS NULL) admits NOBODY through the club
--      arm -- the MYK9-258 / MYK9-329 / MYK9-585 guard. Asserted for the
--      secretary (refused) and the site admin (accepted).
--
-- Note on DELETE: an unreachable row fails the USING clause, so the row is
-- filtered out and the DELETE removes 0 rows rather than raising. Only a WITH
-- CHECK violation (INSERT, or an UPDATE's new row) raises 42501. Both shapes are
-- asserted in the form the policy actually produces.
--
-- Every announcement here is priority 'normal', so no case touches
-- on_announcement_insert_push -- this file is about RLS, not the push fan-out.
--
-- Runs ONLY in CI: there is no container runtime on the development Mac, so the
-- behavioral SQL harness never executes locally. Registered in
-- scripts/qa/run-behavioral-sql-tests.sh AND in launchCriticalSqlTests in
-- scripts/qa/run-behavioral-sql-tests.test.ts.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--     -f supabase/tests/show_announcements_scope_test.sql
-- All fixtures roll back.

BEGIN;

-- A schema-only isolated database has no seed data; a seeded one already has
-- these rows and the ON CONFLICT makes the insert a no-op. Either way the
-- lookups below resolve by NAME, never by the fixture id.
INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000000636801', 'secretary', 'MYK9-636 fixture', true),
  ('00000000-0000-0000-0000-000000636802', 'site_admin', 'MYK9-636 fixture', true),
  ('00000000-0000-0000-0000-000000636803', 'judge', 'MYK9-636 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000636001', 'MYK9-636 Club A'),
  ('00000000-0000-0000-0000-000000636002', 'MYK9-636 Club B');

-- People FIRST with an email and a NULL auth link: handle_new_user() adopts an
-- existing person by LOWER(email) when auth.users is inserted. Setting
-- people.auth_user_id directly looks equivalent and is not -- the trigger would
-- INSERT a fresh people row and collide with people_auth_user_id_key.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000636011', 'MYK9-636', 'Secretary A',
   'myk9-636-secretary-a@example.test', NULL),
  ('00000000-0000-0000-0000-000000636012', 'MYK9-636', 'Exhibitor',
   'myk9-636-exhibitor@example.test', NULL),
  ('00000000-0000-0000-0000-000000636013', 'MYK9-636', 'Site Admin',
   'myk9-636-site-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000000636014', 'MYK9-636', 'Judge',
   'myk9-636-judge@example.test', NULL);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
VALUES
  ('00000000-0000-0000-0000-000000636101','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','myk9-636-secretary-a@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-000000636102','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','myk9-636-exhibitor@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-000000636103','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','myk9-636-site-admin@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-000000636104','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','myk9-636-judge@example.test','', now(), now(), now(), '{}','{}', false, false, false);

-- Guard the assumption every identity below rests on.
DO $adopt$
BEGIN
  IF (SELECT auth_user_id FROM public.people WHERE id = '00000000-0000-0000-0000-000000636011')
     IS DISTINCT FROM '00000000-0000-0000-0000-000000636101'::uuid THEN
    RAISE EXCEPTION 'FAIL 0.0 handle_new_user did not adopt the seeded person by email';
  END IF;
  IF (SELECT auth_user_id FROM public.people WHERE id = '00000000-0000-0000-0000-000000636014')
     IS DISTINCT FROM '00000000-0000-0000-0000-000000636104'::uuid THEN
    RAISE EXCEPTION 'FAIL 0.1 handle_new_user did not adopt the seeded judge by email';
  END IF;
  RAISE NOTICE 'PASS 0.0 seeded people adopted by handle_new_user';
END $adopt$;

-- is_trial_secretary() matches a CLUB-scoped appointment: r.name IN
-- ('secretary','trial_secretary'), ur.is_active, and -- the part that is easy to
-- get wrong -- ur.show_id IS NULL. It does NOT consult club_members, so no
-- membership row is needed here.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000636011', id, '00000000-0000-0000-0000-000000636001', true,
       '00000000-0000-0000-0000-000000636101'
FROM public.roles WHERE name = 'secretary';

-- Site admin: no club scope, and the only identity that should reach the
-- club-less show.
INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000636013', id, true, '00000000-0000-0000-0000-000000636103'
FROM public.roles WHERE name = 'site_admin';

-- The exhibitor gets NO role at all -- an account, nothing more, which is
-- precisely the attacker MYK9-636 describes.

-- enforce_show_publish_gate / enforce_show_club_authorization carve out any
-- session whose `role` GUC is not 'authenticated'/'anon', so these fixture rows
-- (running as the migration owner) insert 'published' without tripping MK003/MK004.
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  ('00000000-0000-0000-0000-000000636021', 'MYK9-636 Club A Show', 'AKC',
   current_date, current_date + 1, 'published', '00000000-0000-0000-0000-000000636001'),
  ('00000000-0000-0000-0000-000000636022', 'MYK9-636 Club B Show', 'AKC',
   current_date, current_date + 1, 'published', '00000000-0000-0000-0000-000000636002'),
  -- Club-less, and 'published' for the reason null_club_policy_authorization_test
  -- documents: a draft club-less show is invisible to shows_select anyway, which
  -- would make a refusal assertion pass for the wrong reason.
  ('00000000-0000-0000-0000-000000636023', 'MYK9-636 Club-less Show', 'AKC',
   current_date, current_date + 1, 'published', NULL);

-- The judge arm is ASSIGNMENT-based, not role-based: the policy joins
-- judge_assignments by the caller's people row, exactly as
-- private.entry_results_caller_context() and public.get_show_judges() do. This
-- judge is assigned to club A's show and to NOTHING on club B's.
INSERT INTO public.judge_assignments (id, person_id, show_id, status)
VALUES ('00000000-0000-0000-0000-000000636071', '00000000-0000-0000-0000-000000636014',
        '00000000-0000-0000-0000-000000636021', 'confirmed');

-- Seeded as the owner (RLS does not apply), so the cases below have targets that
-- the caller did NOT author, and legacy rows whose author is nobody official.
INSERT INTO public.show_announcements (id, show_id, author_id, author_role, author_name,
                                       title, content, priority)
VALUES
  -- Authored by the site admin on club A's show: the secretary's UPDATE and
  -- DELETE target, and the judge's "somebody else's row" DELETE target.
  ('00000000-0000-0000-0000-000000636031', '00000000-0000-0000-0000-000000636021',
   '00000000-0000-0000-0000-000000636103', 'club_admin', 'MYK9-636 Site Admin',
   'MYK9-636 stray on club A', 'Someone else posted this.', 'normal'),
  -- Authored by the site admin on club B's show: the cross-club refusal target.
  ('00000000-0000-0000-0000-000000636032', '00000000-0000-0000-0000-000000636022',
   '00000000-0000-0000-0000-000000636103', 'club_admin', 'MYK9-636 Site Admin',
   'MYK9-636 stray on club B', 'Another club''s announcement.', 'normal'),
  -- Authored BY THE EXHIBITOR: the positive control for the author arm of DELETE.
  ('00000000-0000-0000-0000-000000636033', '00000000-0000-0000-0000-000000636021',
   '00000000-0000-0000-0000-000000636102', 'secretary', 'MYK9-636 Exhibitor',
   'MYK9-636 exhibitor''s own row', 'Mine to delete.', 'normal'),
  -- Also the exhibitor's: the relocation attempt's target. A legacy row of
  -- exactly the shape the old INSERT policy allowed anybody to create.
  ('00000000-0000-0000-0000-000000636034', '00000000-0000-0000-0000-000000636021',
   '00000000-0000-0000-0000-000000636102', 'secretary', 'MYK9-636 Exhibitor',
   'MYK9-636 exhibitor''s legacy row', 'Mine to try to move.', 'normal'),
  -- The judge's own row on the show they are assigned to.
  ('00000000-0000-0000-0000-000000636035', '00000000-0000-0000-0000-000000636021',
   '00000000-0000-0000-0000-000000636104', 'judge', 'MYK9-636 Judge',
   'MYK9-636 judge''s own row', 'Ring 2 briefing.', 'normal');

-- ---------------------------------------------------------------------------
-- 1, 2, 3. The exhibitor: an account with no role and no assignment anywhere.
-- ---------------------------------------------------------------------------
DO $case1$
DECLARE
  n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000636102', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000636102',
                       'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
    true
  );

  BEGIN
    INSERT INTO public.show_announcements (show_id, author_id, author_role, author_name,
                                           title, content, priority)
    VALUES ('00000000-0000-0000-0000-000000636021',
            '00000000-0000-0000-0000-000000636102', 'secretary', 'MYK9-636 Exhibitor',
            'MYK9-636 injected', 'Ring 3 is cancelled.', 'normal');
    RAISE EXCEPTION 'FAIL 1.0 an exhibitor inserted an announcement onto a show they do not run (MYK9-636)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 1.0 exhibitor INSERT onto another club''s show raises 42501';
  END;

  -- 2. The UPDATE hole. USING's author arm reaches this row, so the only thing
  --    standing between the author and another club's show is the WITH CHECK.
  BEGIN
    UPDATE public.show_announcements
       SET show_id = '00000000-0000-0000-0000-000000636022', priority = 'urgent'
     WHERE id = '00000000-0000-0000-0000-000000636034';
    RAISE EXCEPTION 'FAIL 2.0 an author relocated their announcement onto another club''s show';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 2.0 an author cannot relocate their announcement to another show';
  END;

  -- The same author cannot edit the row in place either: they are neither the
  -- show's official nor its judge, and WITH CHECK has no bare author arm
  -- (a policy cannot see OLD, so "author, if show_id is unchanged" is not
  -- expressible). They may still DELETE it, which is the escape hatch.
  BEGIN
    UPDATE public.show_announcements SET content = 'edited'
     WHERE id = '00000000-0000-0000-0000-000000636034';
    RAISE EXCEPTION 'FAIL 2.1 a non-official author edited an announcement in place';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 2.1 a non-official author cannot edit their announcement in place';
  END;

  -- 3. Positive control for the author arm of DELETE. Without this, case 1 would
  --    also pass against a policy that refused the exhibitor everything.
  DELETE FROM public.show_announcements WHERE id = '00000000-0000-0000-0000-000000636033';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 3.0 the author lost DELETE on their own announcement: %', n;
  END IF;
  RAISE NOTICE 'PASS 3.0 the author arm of DELETE survives';

  RESET ROLE;
END $case1$;

-- ---------------------------------------------------------------------------
-- 4. The judge, assigned to club A's show and nothing else.
-- ---------------------------------------------------------------------------
DO $case4$
DECLARE
  n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000636104', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000636104',
                       'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
    true
  );

  -- 4.0 The capability the Message Center composer has always offered a judge.
  INSERT INTO public.show_announcements (id, show_id, author_id, author_role, author_name,
                                         title, content, priority)
  VALUES ('00000000-0000-0000-0000-000000636037', '00000000-0000-0000-0000-000000636021',
          '00000000-0000-0000-0000-000000636104', 'judge', 'MYK9-636 Judge',
          'MYK9-636 judge posts', 'Walkthrough at 9.', 'normal');
  RAISE NOTICE 'PASS 4.0 an assigned judge can post on their own show';

  -- 4.1 ... and only there.
  BEGIN
    INSERT INTO public.show_announcements (show_id, author_id, author_role, author_name,
                                           title, content, priority)
    VALUES ('00000000-0000-0000-0000-000000636022',
            '00000000-0000-0000-0000-000000636104', 'judge', 'MYK9-636 Judge',
            'MYK9-636 judge elsewhere', 'Not my show.', 'normal');
    RAISE EXCEPTION 'FAIL 4.1 a judge posted on a show they are not assigned to';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 4.1 a judge cannot post on a show they are not assigned to';
  END;

  -- 4.2 Their own row, edited in place.
  UPDATE public.show_announcements SET content = 'Walkthrough at 9:15.'
   WHERE id = '00000000-0000-0000-0000-000000636035';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 4.2 an assigned judge could not edit their own announcement: %', n;
  END IF;
  RAISE NOTICE 'PASS 4.2 an assigned judge edits their own announcement';

  -- 4.3 ... but cannot relocate it.
  BEGIN
    UPDATE public.show_announcements SET show_id = '00000000-0000-0000-0000-000000636022'
     WHERE id = '00000000-0000-0000-0000-000000636035';
    RAISE EXCEPTION 'FAIL 4.3 a judge relocated their announcement onto another show';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 4.3 a judge cannot relocate their announcement';
  END;

  -- 4.4 Deleting somebody ELSE's announcement stays a secretary power. The row
  --     fails DELETE's USING, so it is filtered out rather than raising.
  DELETE FROM public.show_announcements WHERE id = '00000000-0000-0000-0000-000000636031';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 4.4 a judge deleted another author''s announcement: %', n;
  END IF;
  RAISE NOTICE 'PASS 4.4 a judge cannot delete another author''s announcement';

  RESET ROLE;
END $case4$;

-- ---------------------------------------------------------------------------
-- 5, 6, 7a. Club A's secretary.
-- ---------------------------------------------------------------------------
DO $case5$
DECLARE
  n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000636101', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000636101',
                       'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
    true
  );

  -- 5.0 Their own club's show.
  INSERT INTO public.show_announcements (id, show_id, author_id, author_role, author_name,
                                         title, content, priority)
  VALUES ('00000000-0000-0000-0000-000000636036', '00000000-0000-0000-0000-000000636021',
          '00000000-0000-0000-0000-000000636101', 'secretary', 'MYK9-636 Secretary A',
          'MYK9-636 legitimate', 'Briefing at 8am.', 'normal');
  RAISE NOTICE 'PASS 5.0 the show''s own secretary can still post';

  -- 5.1 Club B's show.
  BEGIN
    INSERT INTO public.show_announcements (show_id, author_id, author_role, author_name,
                                           title, content, priority)
    VALUES ('00000000-0000-0000-0000-000000636022',
            '00000000-0000-0000-0000-000000636101', 'secretary', 'MYK9-636 Secretary A',
            'MYK9-636 cross-club', 'Not my show.', 'normal');
    RAISE EXCEPTION 'FAIL 5.1 a club A secretary inserted onto a club B show (MYK9-636)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 5.1 cross-club secretary INSERT raises 42501';
  END;

  -- 7a. The club-less show reaches nobody through the club arm.
  BEGIN
    INSERT INTO public.show_announcements (show_id, author_id, author_role, author_name,
                                           title, content, priority)
    VALUES ('00000000-0000-0000-0000-000000636023',
            '00000000-0000-0000-0000-000000636101', 'secretary', 'MYK9-636 Secretary A',
            'MYK9-636 club-less', 'No club owns this show.', 'normal');
    RAISE EXCEPTION 'FAIL 7.0 a club-less show admitted a secretary (MYK9-258 guard lost)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 7.0 a club-less show admits no secretary';
  END;

  -- 6.0 UPDATE an announcement authored by somebody else on THEIR show.
  UPDATE public.show_announcements SET content = 'Corrected by the secretary.'
   WHERE id = '00000000-0000-0000-0000-000000636031';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 6.0 the show''s secretary could not edit another author''s announcement: %', n;
  END IF;
  RAISE NOTICE 'PASS 6.0 the show''s secretary edits another author''s announcement';

  -- 6.1 ... and cannot relocate even their OWN row off their show.
  BEGIN
    UPDATE public.show_announcements SET show_id = '00000000-0000-0000-0000-000000636022'
     WHERE id = '00000000-0000-0000-0000-000000636036';
    RAISE EXCEPTION 'FAIL 6.1 a secretary relocated an announcement onto another club''s show';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 6.1 a secretary cannot relocate an announcement off their show';
  END;

  -- 6.2 DELETE a stray the site admin authored on THEIR show. This is the arm
  --     MYK9-636 reported as missing entirely.
  DELETE FROM public.show_announcements WHERE id = '00000000-0000-0000-0000-000000636031';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 6.2 the show''s secretary could not delete a stray announcement on their own show: %', n;
  END IF;
  RAISE NOTICE 'PASS 6.2 the show''s secretary can delete another author''s announcement';

  -- 6.3 ... and not one on club B's show. Same statement shape as 6.2, so a
  --     policy that allowed every delete would fail here.
  DELETE FROM public.show_announcements WHERE id = '00000000-0000-0000-0000-000000636032';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 6.3 a club A secretary deleted an announcement on a club B show: %', n;
  END IF;
  RAISE NOTICE 'PASS 6.3 cross-club DELETE removes nothing';

  RESET ROLE;
END $case5$;

-- ---------------------------------------------------------------------------
-- 7b. The platform admin is the ONLY identity that reaches the club-less show.
-- ---------------------------------------------------------------------------
DO $case7$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000636103', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000636103',
                       'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
    true
  );

  INSERT INTO public.show_announcements (id, show_id, author_id, author_role, author_name,
                                         title, content, priority)
  VALUES ('00000000-0000-0000-0000-000000636038', '00000000-0000-0000-0000-000000636023',
          '00000000-0000-0000-0000-000000636103', 'club_admin', 'MYK9-636 Site Admin',
          'MYK9-636 admin on club-less show', 'Platform admin still reaches it.', 'normal');
  RAISE NOTICE 'PASS 7.1 the platform admin still reaches a club-less show';

  RESET ROLE;
END $case7$;

-- Final shape check. Club A's show: the exhibitor's legacy row and the judge's
-- own row survive, the exhibitor's other row and the site admin's stray were
-- deleted, and the judge's and secretary's new rows landed -- four. Club B's one
-- row was never touched, and the club-less show holds only the admin's.
DO $tally$
DECLARE
  club_a integer;
  club_b integer;
  club_less integer;
BEGIN
  SELECT count(*) INTO club_a FROM public.show_announcements
   WHERE show_id = '00000000-0000-0000-0000-000000636021';
  SELECT count(*) INTO club_b FROM public.show_announcements
   WHERE show_id = '00000000-0000-0000-0000-000000636022';
  SELECT count(*) INTO club_less FROM public.show_announcements
   WHERE show_id = '00000000-0000-0000-0000-000000636023';

  IF club_a <> 4 THEN
    RAISE EXCEPTION 'FAIL 8.0 club A show should hold 4 rows, holds %', club_a;
  END IF;
  IF club_b <> 1 THEN
    RAISE EXCEPTION 'FAIL 8.1 club B show should still hold its one untouched row, holds %', club_b;
  END IF;
  IF club_less <> 1 THEN
    RAISE EXCEPTION 'FAIL 8.2 club-less show should hold the platform admin''s row only, holds %', club_less;
  END IF;
  RAISE NOTICE 'PASS 8.0 final row tally matches the policy set';
END $tally$;

ROLLBACK;
