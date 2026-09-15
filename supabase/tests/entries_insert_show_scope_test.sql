-- MYK9-577: behavioral test for the row-scoped entries_insert RLS policy
-- added by 20260915194500_scope_entries_insert_to_show.sql.
--
-- Exercises the ONLY caller tier that ever hits this policy directly: the
-- secretary offline/desk-entry path (replicatedEntriesTable.createEntry ->
-- executeMutation -> `supabase.from('entries').insert(...)` as the
-- authenticated secretary). Exhibitor self-entry goes through the SECURITY
-- DEFINER submit_show_entries RPC and bypasses this policy entirely, so it
-- is out of scope here.
--
-- Asserts:
--   1. A secretary appointed only to Club A cannot INSERT an entry onto a
--      Club B show (cross-tenant write -- the bug this migration fixes).
--   2. The same secretary CAN insert an entry onto Club A's own show.
--   3. A site admin can insert onto either show.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated local database;
-- every fixture rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/entries_insert_show_scope_test.sql

begin;

-- Schema-only isolated databases have no seed data -- match
-- myk9_114_entry_access_context_test.sql's pattern of seeding the roles
-- this test needs.
insert into public.roles (id, name, description, is_system)
values
  ('00000000-0000-0000-0000-000000577801', 'secretary', 'MYK9-577 fixture', true),
  ('00000000-0000-0000-0000-000000577802', 'site_admin', 'MYK9-577 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values
  ('00000000-0000-0000-0000-000000577001', 'MYK9-577 Club A'),
  ('00000000-0000-0000-0000-000000577002', 'MYK9-577 Club B');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
values
  ('00000000-0000-0000-0000-000000577011', 'MYK9-577 Show A', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000577001',
   'published', true, true),
  ('00000000-0000-0000-0000-000000577012', 'MYK9-577 Show B', 'AKC',
   current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000577002',
   'published', true, true);

insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values
  ('00000000-0000-0000-0000-000000577021', '00000000-0000-0000-0000-000000577011',
   'MYK9-577 Trial A', current_date + 10, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000000577022', '00000000-0000-0000-0000-000000577012',
   'MYK9-577 Trial B', current_date + 10, 'AKC', 'Scent Work');

insert into public.classes (id, trial_id, name, element, level)
values
  ('00000000-0000-0000-0000-000000577031', '00000000-0000-0000-0000-000000577021',
   'Container Novice A', 'Container', 'Novice'),
  ('00000000-0000-0000-0000-000000577032', '00000000-0000-0000-0000-000000577022',
   'Container Novice B', 'Container', 'Novice');

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
insert into public.dogs (id, name, call_name, breed, status)
values ('00000000-0000-0000-0000-000000577041', 'MYK9-577 Dog', 'Scoper', 'Beagle', 'active');

-- Both trials are AKC, so one registration satisfies
-- trg_entries_require_dog_registration for every entry below.
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000577041', 'AKC', 'SR5770001', true);

insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000577051', 'Club A', 'Secretary',
   '00000000-0000-0000-0000-000000577151'),
  ('00000000-0000-0000-0000-000000577052', 'Site', 'Admin',
   '00000000-0000-0000-0000-000000577152');

-- Club-scoped secretary appointment for Club A only (ur.show_id IS NULL,
-- matches is_trial_secretary()'s club-wide shape, per
-- 20260830210000_appointment_grants_show_access.sql).
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000577051', id, '00000000-0000-0000-0000-000000577001',
  true, '00000000-0000-0000-0000-000000577151'
from public.roles where name = 'secretary';

insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000577052', id, true, '00000000-0000-0000-0000-000000577152'
from public.roles where name = 'site_admin';

-- 1. Club A's secretary cannot insert an entry onto Club B's show.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000577151', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000577151","role":"authenticated","app_metadata":{}}',
  true
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.entries (dog_id, class_id, show_id, trial_id, entry_status)
    VALUES ('00000000-0000-0000-0000-000000577041', '00000000-0000-0000-0000-000000577032',
      '00000000-0000-0000-0000-000000577012', '00000000-0000-0000-0000-000000577022',
      'confirmed');
    RAISE EXCEPTION 'FAIL cross-club secretary insert onto another club''s show succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS cross-club secretary insert is rejected';
  END;
END;
$$;

RESET ROLE;

-- 2. The same secretary CAN insert onto Club A's own show.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000577151', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000577151","role":"authenticated","app_metadata":{}}',
  true
);

INSERT INTO public.entries (dog_id, class_id, show_id, trial_id, entry_status)
VALUES ('00000000-0000-0000-0000-000000577041', '00000000-0000-0000-0000-000000577031',
  '00000000-0000-0000-0000-000000577011', '00000000-0000-0000-0000-000000577021',
  'confirmed');

RESET ROLE;

DO $$
DECLARE
  own_show_count integer;
BEGIN
  SELECT count(*) INTO own_show_count FROM public.entries
   WHERE show_id = '00000000-0000-0000-0000-000000577011';
  IF own_show_count <> 1 THEN
    RAISE EXCEPTION 'FAIL secretary insert onto own club''s show did not land: %', own_show_count;
  END IF;
  RAISE NOTICE 'PASS same-club secretary insert succeeds';
END;
$$;

-- 3. A site admin can insert onto either show.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000577152', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000577152","role":"authenticated","app_metadata":{}}',
  true
);

INSERT INTO public.entries (dog_id, class_id, show_id, trial_id, entry_status)
VALUES ('00000000-0000-0000-0000-000000577041', '00000000-0000-0000-0000-000000577032',
  '00000000-0000-0000-0000-000000577012', '00000000-0000-0000-0000-000000577022',
  'confirmed');

RESET ROLE;

DO $$
DECLARE
  admin_show_count integer;
BEGIN
  SELECT count(*) INTO admin_show_count FROM public.entries
   WHERE show_id = '00000000-0000-0000-0000-000000577012';
  IF admin_show_count <> 1 THEN
    RAISE EXCEPTION 'FAIL site admin insert onto Club B''s show did not land: %', admin_show_count;
  END IF;
  RAISE NOTICE 'PASS site admin insert succeeds on any show';
END;
$$;

ROLLBACK;
