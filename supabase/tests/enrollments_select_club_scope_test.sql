-- MYK9-663: behavioral test for the club-scoped enrollments_select RLS policy
-- added by 20260918173900_scope_enrollments_select_to_show_club.sql.
--
-- Before that migration the policy's role disjunct matched
--   r.name = ANY (ARRAY['secretary','club_admin','site_admin','platform_admin'])
--   AND (ur.show_id = enrollments.show_id OR ur.show_id IS NULL)
-- with no ur.club_id term, so a club-scoped secretary or club_admin of ANY
-- club read EVERY club's enrollments.
--
-- Asserts:
--   1. Club A's secretary reads all of Club A's enrollments.
--   2. Club A's secretary reads NONE of Club B's enrollments (the bug).
--   3. Club A's club_admin has the same two properties.
--   4. An exhibitor still reads their own enrollment (handler_id arm),
--      on a show belonging to a club they have no role in, and reads no
--      other handler's enrollment.
--   5. A show-scoped steward on Club B's show still reads that show's
--      enrollments via is_show_official(show_id).
--   6. A site admin reads every club's enrollments.
--   8. A show-pinned club_admin reads that show but not another show of the
--      same club. This catches widening through manageable_show_ids().
--   7. A secretary row that ALSO pins ur.show_id grants nothing THROUGH THE
--      ROLE ARM, even on its own club's show -- while that same persona still
--      reads the one enrollment they handle themselves. The handler row is the
--      positive control: a pure "sees 0" assertion would pass vacuously if the
--      fixture never landed or the impersonation never reached a real identity,
--      and unlike assertions 1/3/5/6 this one requires no positive count of its
--      own. It also cannot inherit the usual "it ran red first" defence: psql
--      stops at the first failing statement, so the red run against the
--      deployed policy ends at assertion 2 and never reaches here. Run
--      standalone against the old predicate this persona sees 3 rows, not 1. This is a deliberate tightening, not an accident:
--      is_trial_secretary() requires ur.show_id IS NULL, and is_show_official()
--      admits secretary and chairman only on club-scoped rows, reserving its
--      show-scoped arm for stewards (MYK9-114 /
--      show_officials_label_not_permission_test.sql). entries_select has
--      behaved this way since MYK9-126, so this brings enrollments into line
--      rather than inventing a rule. Zero such rows existed on the live
--      database when MYK9-663 shipped; the assertion pins the intent so a
--      future "restore show-scoped grants" change argues with a red test
--      rather than a comment. (The club_id-less variant of this row cannot be
--      constructed at all: the AFTER-INSERT constraint trigger
--      trg_enforce_club_id_for_scoped_roles rejects a secretary, trial_secretary
--      or club_admin row with a NULL club_id.)
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated local database;
-- every fixture rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/enrollments_select_club_scope_test.sql

begin;

-- Schema-only isolated databases have no seed data -- match
-- entries_insert_show_scope_test.sql's pattern of seeding the roles this
-- test needs.
insert into public.roles (id, name, description, is_system)
values
  ('00000000-0000-0000-0000-000000663801', 'secretary', 'MYK9-663 fixture', true),
  ('00000000-0000-0000-0000-000000663802', 'site_admin', 'MYK9-663 fixture', true),
  ('00000000-0000-0000-0000-000000663803', 'club_admin', 'MYK9-663 fixture', true),
  ('00000000-0000-0000-0000-000000663804', 'steward', 'MYK9-663 fixture', true),
  ('00000000-0000-0000-0000-000000663805', 'exhibitor', 'MYK9-663 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values
  ('00000000-0000-0000-0000-000000663001', 'MYK9-663 Club A'),
  ('00000000-0000-0000-0000-000000663002', 'MYK9-663 Club B');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
values
  ('00000000-0000-0000-0000-000000663011', 'MYK9-663 Show A', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000663001',
   'published', true, true),
  ('00000000-0000-0000-0000-000000663012', 'MYK9-663 Show B', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000663002',
   'published', true, true),
  ('00000000-0000-0000-0000-000000663013', 'MYK9-663 Show A2', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000663001',
   'published', true, true);

insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000663051', 'Club A', 'Secretary',
   '00000000-0000-0000-0000-000000663151'),
  ('00000000-0000-0000-0000-000000663052', 'Site', 'Admin',
   '00000000-0000-0000-0000-000000663152'),
  ('00000000-0000-0000-0000-000000663053', 'Club A', 'Admin',
   '00000000-0000-0000-0000-000000663153'),
  ('00000000-0000-0000-0000-000000663054', 'Show B', 'Steward',
   '00000000-0000-0000-0000-000000663154'),
  ('00000000-0000-0000-0000-000000663055', 'Lone', 'Exhibitor',
   '00000000-0000-0000-0000-000000663155'),
  ('00000000-0000-0000-0000-000000663056', 'Other', 'Handler',
   '00000000-0000-0000-0000-000000663156'),
  ('00000000-0000-0000-0000-000000663057', 'Show Pinned', 'Secretary',
   '00000000-0000-0000-0000-000000663157'),
  ('00000000-0000-0000-0000-000000663058', 'Show Pinned', 'Club Admin',
   '00000000-0000-0000-0000-000000663158');

-- Club-scoped appointments (ur.show_id IS NULL), the shape
-- is_trial_secretary()/is_club_admin() require -- see
-- 20260830210000_appointment_grants_show_access.sql.
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000663051', id, '00000000-0000-0000-0000-000000663001',
  true, '00000000-0000-0000-0000-000000663151'
from public.roles where name = 'secretary';

insert into public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000663058', id, '00000000-0000-0000-0000-000000663001',
  '00000000-0000-0000-0000-000000663011', true, '00000000-0000-0000-0000-000000663158'
from public.roles where name = 'club_admin';

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000663053', id, '00000000-0000-0000-0000-000000663001',
  true, '00000000-0000-0000-0000-000000663153'
from public.roles where name = 'club_admin';

-- A steward's show-scoped row IS an operational assignment, not a paperwork
-- label (MYK9-114 / show_officials_label_not_permission_test.sql), so
-- is_show_official(show_id) admits it. This arm is untouched by MYK9-663.
insert into public.user_roles (user_id, role_id, show_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000663054', id, '00000000-0000-0000-0000-000000663012',
  true, '00000000-0000-0000-0000-000000663154'
from public.roles where name = 'steward';

-- A secretary row for Club A that ALSO pins show_id to Club A's own show.
-- club_id is mandatory here -- trg_enforce_club_id_for_scoped_roles rejects a
-- NULL one -- so this is the only constructible show-scoped secretary shape.
-- Assertion 7 pins that it grants nothing.
insert into public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000663057', id, '00000000-0000-0000-0000-000000663001',
  '00000000-0000-0000-0000-000000663011', true, '00000000-0000-0000-0000-000000663157'
from public.roles where name = 'secretary';

insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000663052', id, true, '00000000-0000-0000-0000-000000663152'
from public.roles where name = 'site_admin';

insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000663055', id, true, '00000000-0000-0000-0000-000000663155'
from public.roles where name = 'exhibitor';

-- Two enrollments on Club A's show, two on Club B's. The exhibitor under
-- test handles one of Club B's -- a club they hold no staff role in -- so
-- assertion 4 proves the handler_id arm survives the tightening.
insert into public.enrollments (id, show_id, handler_id)
values
  ('00000000-0000-0000-0000-000000663061', '00000000-0000-0000-0000-000000663011',
   '00000000-0000-0000-0000-000000663056'),
  ('00000000-0000-0000-0000-000000663062', '00000000-0000-0000-0000-000000663011',
   '00000000-0000-0000-0000-000000663055'),
  ('00000000-0000-0000-0000-000000663063', '00000000-0000-0000-0000-000000663012',
   '00000000-0000-0000-0000-000000663056'),
  ('00000000-0000-0000-0000-000000663064', '00000000-0000-0000-0000-000000663012',
   '00000000-0000-0000-0000-000000663055'),
  -- Assertion 7's positive control: the show-pinned secretary handles this one
  -- personally, on the club they have NO staff role in.
  ('00000000-0000-0000-0000-000000663065', '00000000-0000-0000-0000-000000663012',
   '00000000-0000-0000-0000-000000663057'),
  -- Same club, different show: the show-pinned club_admin must not see this.
  ('00000000-0000-0000-0000-000000663066', '00000000-0000-0000-0000-000000663013',
   '00000000-0000-0000-0000-000000663056');

-- Positive control: as the table owner, RLS is bypassed and all six rows are
-- present. Without this, a fixture that silently failed to insert would make
-- every "reads none of Club B's" assertion below pass vacuously.
DO $$
DECLARE
  total integer;
BEGIN
  SELECT count(*) INTO total FROM public.enrollments
    WHERE show_id IN ('00000000-0000-0000-0000-000000663011',
                     '00000000-0000-0000-0000-000000663012',
                     '00000000-0000-0000-0000-000000663013');
  IF total <> 6 THEN
    RAISE EXCEPTION 'FAIL fixture did not land: expected 6 enrollments, got %', total;
  END IF;
  RAISE NOTICE 'PASS fixture control: 6 enrollments exist';
END;
$$;

-- 1 + 2. Club A's secretary: all of Club A, none of Club B.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663151', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000663151","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  own_club integer;
  other_club integer;
BEGIN
  SELECT count(*) INTO own_club FROM public.enrollments
   WHERE show_id IN ('00000000-0000-0000-0000-000000663011',
                     '00000000-0000-0000-0000-000000663013');
  SELECT count(*) INTO other_club FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000000663012';
  IF own_club <> 3 THEN
    RAISE EXCEPTION 'FAIL Club A secretary sees % of its own 3 enrollments', own_club;
  END IF;
  IF other_club <> 0 THEN
    RAISE EXCEPTION 'FAIL Club A secretary reads % of Club B''s enrollments', other_club;
  END IF;
  RAISE NOTICE 'PASS club-scoped secretary reads own club only';
END;
$$;

RESET ROLE;

-- 3. Club A's club_admin: same two properties.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663153', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000663153","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  own_club integer;
  other_club integer;
BEGIN
  SELECT count(*) INTO own_club FROM public.enrollments
   WHERE show_id IN ('00000000-0000-0000-0000-000000663011',
                     '00000000-0000-0000-0000-000000663013');
  SELECT count(*) INTO other_club FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000000663012';
  IF own_club <> 3 THEN
    RAISE EXCEPTION 'FAIL Club A club_admin sees % of its own 3 enrollments', own_club;
  END IF;
  IF other_club <> 0 THEN
    RAISE EXCEPTION 'FAIL Club A club_admin reads % of Club B''s enrollments', other_club;
  END IF;
  RAISE NOTICE 'PASS club-scoped club_admin reads own club only';
END;
$$;

RESET ROLE;

-- 4. The exhibitor arm (handler_id) is untouched: their own enrollment on a
--    club they have no role in is still readable, and nobody else's is.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663155', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000663155","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  own_rows integer;
  foreign_rows integer;
BEGIN
  SELECT count(*) INTO own_rows FROM public.enrollments
   WHERE handler_id = '00000000-0000-0000-0000-000000663055';
  SELECT count(*) INTO foreign_rows FROM public.enrollments
   WHERE handler_id = '00000000-0000-0000-0000-000000663056';
  IF own_rows <> 2 THEN
    RAISE EXCEPTION 'FAIL exhibitor reads % of their own 2 enrollments', own_rows;
  END IF;
  IF foreign_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL exhibitor reads % of another handler''s enrollments', foreign_rows;
  END IF;
  RAISE NOTICE 'PASS exhibitor keeps their own enrollments and no others';
END;
$$;

RESET ROLE;

-- 5. The is_show_official arm is untouched: a show-scoped steward on Club B's
--    show still reads that show's enrollments, and not Club A's.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663154', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000663154","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  assigned_show integer;
  other_show integer;
BEGIN
  SELECT count(*) INTO assigned_show FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000000663012';
  SELECT count(*) INTO other_show FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000000663011';
  IF assigned_show <> 3 THEN
    RAISE EXCEPTION 'FAIL show-scoped steward sees % of their show''s 3 enrollments', assigned_show;
  END IF;
  IF other_show <> 0 THEN
    RAISE EXCEPTION 'FAIL show-scoped steward reads % enrollments of another show', other_show;
  END IF;
  RAISE NOTICE 'PASS show official keeps their own show and reads no other';
END;
$$;

RESET ROLE;

-- 6. A site admin still reads every club's enrollments.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663152', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000663152","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  total integer;
BEGIN
  SELECT count(*) INTO total FROM public.enrollments
   WHERE show_id IN ('00000000-0000-0000-0000-000000663011',
                     '00000000-0000-0000-0000-000000663012',
                     '00000000-0000-0000-0000-000000663013');
  IF total <> 6 THEN
    RAISE EXCEPTION 'FAIL site admin sees % of 6 enrollments', total;
  END IF;
  RAISE NOTICE 'PASS site admin reads every club''s enrollments';
END;
$$;

RESET ROLE;

-- 8. A show-pinned club_admin keeps exact-show scope, including against
-- another show of the same club.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663158', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000663158","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  pinned_show integer;
  other_show_same_club integer;
  foreign_club integer;
BEGIN
  SELECT count(*) INTO pinned_show FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000000663011';
  SELECT count(*) INTO other_show_same_club FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000000663013';
  SELECT count(*) INTO foreign_club FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000000663012';
  IF pinned_show <> 2 OR other_show_same_club <> 0 OR foreign_club <> 0 THEN
    RAISE EXCEPTION
      'FAIL show-pinned club_admin visibility: pinned %, same-club other %, foreign-club %',
      pinned_show, other_show_same_club, foreign_club;
  END IF;
  RAISE NOTICE 'PASS show-pinned club_admin remains scoped to its assigned show';
END;
$$;

RESET ROLE;

-- 7. A show-pinned secretary row retains access to its assigned show.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000663157', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000663157","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
DECLARE
  own_handled integer;
  visible integer;
BEGIN
  -- Positive control FIRST: if this is 0 the impersonation never reached a real
  -- identity, and the zero-role-arm assertion below would be meaningless.
  SELECT count(*) INTO own_handled FROM public.enrollments
   WHERE handler_id = '00000000-0000-0000-0000-000000663057';
  IF own_handled <> 1 THEN
    RAISE EXCEPTION
      'FAIL positive control: show-pinned secretary reads % of the 1 enrollment they handle',
      own_handled;
  END IF;

  -- The assigned-show role arm grants both Club A Show A rows. It must not
  -- widen to Club B or Club A Show A2.
  SELECT count(*) INTO visible FROM public.enrollments
   WHERE show_id = '00000000-0000-0000-0000-000000663011';
  IF visible <> 2 THEN
    RAISE EXCEPTION
      'FAIL show-pinned secretary sees % enrollments on the assigned show; expected 2',
      visible;
  END IF;
  RAISE NOTICE 'PASS show-pinned secretary retains assigned-show enrollment read';
END;
$$;

RESET ROLE;

ROLLBACK;
