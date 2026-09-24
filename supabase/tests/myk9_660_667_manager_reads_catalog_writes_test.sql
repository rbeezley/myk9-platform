-- MYK9-660 and MYK9-667: behavioral test for
-- 20260924051700_myk9_660_667_668_manager_reads_catalog_writes_official_hoist.sql.
-- (MYK9-668's enrollments assertions live in enrollments_select_club_scope_test.sql.)
--
-- Asserts:
--   1. A club admin of the show's club reads that show's waitlist_entries and
--      result_submissions, and none of another club's. (Red before: 0 rows.)
--   2. A club admin of ANOTHER club reads none of them, while reading their
--      own show's rows (positive control on the same caller).
--   3. The secretary's reads are unchanged.
--   4. judge_availability and vaccinations are deliberately unchanged: the club
--      admin still reads none, the secretary still reads theirs.
--   5. volunteer_roles: a secretary and a club admin cannot insert, update or
--      delete; a site admin can; everyone keeps read access. (Red before: the
--      secretary's insert succeeded.)
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- Fixture order follows myk9_710_people_identity_guard_test.sql: `people` rows
-- are seeded BEFORE their real `auth.users` rows, so the signup trigger adopts
-- them and creates the exhibitor profile the waitlist rows reference.

begin;

insert into public.roles (id, name, description, is_system)
values
  ('00000000-0000-0000-0000-000000660801', 'secretary', 'MYK9-660 fixture', true),
  ('00000000-0000-0000-0000-000000660802', 'site_admin', 'MYK9-660 fixture', true),
  ('00000000-0000-0000-0000-000000660803', 'club_admin', 'MYK9-660 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values
  ('00000000-0000-0000-0000-000000660001', 'MYK9-660 Club A'),
  ('00000000-0000-0000-0000-000000660002', 'MYK9-660 Club B');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values
  ('00000000-0000-0000-0000-000000660021', 'MYK9-660 Show A', 'AKC',
   current_date, current_date, '00000000-0000-0000-0000-000000660001', 'published'),
  ('00000000-0000-0000-0000-000000660022', 'MYK9-660 Show B', 'AKC',
   current_date, current_date, '00000000-0000-0000-0000-000000660002', 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values
  ('00000000-0000-0000-0000-000000660031', '00000000-0000-0000-0000-000000660021',
   'MYK9-660 Trial A', current_date, 'AKC'),
  ('00000000-0000-0000-0000-000000660032', '00000000-0000-0000-0000-000000660022',
   'MYK9-660 Trial B', current_date, 'AKC');

insert into public.classes (id, trial_id, name, status)
values
  ('00000000-0000-0000-0000-000000660041', '00000000-0000-0000-0000-000000660031',
   'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000660042', '00000000-0000-0000-0000-000000660032',
   'Container Novice', 'upcoming');

-- 011 club A admin, 012 club B admin, 013 club A secretary, 014 site admin,
-- 015 exhibitor (dog owner, waitlisted), 016 judge (availability row only).
insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000000660011', 'MYK9-660', 'ClubAdminA', 'myk9-660-club-admin-a@example.test'),
  ('00000000-0000-0000-0000-000000660012', 'MYK9-660', 'ClubAdminB', 'myk9-660-club-admin-b@example.test'),
  ('00000000-0000-0000-0000-000000660013', 'MYK9-660', 'SecretaryA', 'myk9-660-secretary-a@example.test'),
  ('00000000-0000-0000-0000-000000660014', 'MYK9-660', 'SiteAdmin', 'myk9-660-site-admin@example.test'),
  ('00000000-0000-0000-0000-000000660015', 'MYK9-660', 'Exhibitor', 'myk9-660-exhibitor@example.test'),
  ('00000000-0000-0000-0000-000000660016', 'MYK9-660', 'Judge', 'myk9-660-judge@example.test');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000660101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-660-club-admin-a@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000660102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-660-club-admin-b@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000660103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-660-secretary-a@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000660104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-660-site-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000660105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-660-exhibitor@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select person_id, r.id, club_id, true, auth_id
from (values
  ('00000000-0000-0000-0000-000000660011'::uuid, 'club_admin', '00000000-0000-0000-0000-000000660001'::uuid, '00000000-0000-0000-0000-000000660101'::uuid),
  ('00000000-0000-0000-0000-000000660012'::uuid, 'club_admin', '00000000-0000-0000-0000-000000660002'::uuid, '00000000-0000-0000-0000-000000660102'::uuid),
  ('00000000-0000-0000-0000-000000660013'::uuid, 'secretary', '00000000-0000-0000-0000-000000660001'::uuid, '00000000-0000-0000-0000-000000660103'::uuid)
) as staff(person_id, role_name, club_id, auth_id)
join public.roles r on r.name = staff.role_name;

insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000660014', id, true, '00000000-0000-0000-0000-000000660104'
from public.roles where name = 'site_admin';

-- The dog is entered in Show A, which is what puts its vaccination record in
-- the secretary's reach (vaccinations_select's trial_secretary_show_ids arm).
insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000660051', 'MYK9-660 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000660015');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000660051', 'AKC (American Kennel Club)', 'SR660051', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values ('00000000-0000-0000-0000-000000660061', '00000000-0000-0000-0000-000000660051',
  '00000000-0000-0000-0000-000000660041', '00000000-0000-0000-0000-000000660021',
  '00000000-0000-0000-0000-000000660031', 'MYK9-660 Exhibitor',
  '00000000-0000-0000-0000-000000660015', 'confirmed', 'pending', 25, 'no-status');
insert into public.vaccinations (id, dog_id, vaccine_name, date_administered)
values ('00000000-0000-0000-0000-000000660071', '00000000-0000-0000-0000-000000660051',
  'Rabies', current_date);

insert into public.waitlist_entries (id, class_id, exhibitor_id, dog_id, position, status)
select w.id, w.class_id, ep.id, '00000000-0000-0000-0000-000000660051', 1, 'waiting'
from (values
  ('00000000-0000-0000-0000-000000660081'::uuid, '00000000-0000-0000-0000-000000660041'::uuid),
  ('00000000-0000-0000-0000-000000660082'::uuid, '00000000-0000-0000-0000-000000660042'::uuid)
) as w(id, class_id)
cross join public.exhibitor_profiles ep
where ep.auth_user_id = '00000000-0000-0000-0000-000000660105';

insert into public.result_submissions (id, show_id, organization, sport_type, status)
values
  ('00000000-0000-0000-0000-000000660091', '00000000-0000-0000-0000-000000660021', 'AKC', 'scent_work', 'pending'),
  ('00000000-0000-0000-0000-000000660092', '00000000-0000-0000-0000-000000660022', 'AKC', 'scent_work', 'pending');

insert into public.judge_availability (person_id, availability_status)
values ('00000000-0000-0000-0000-000000660016', 'available');

insert into public.volunteer_roles (id, name, description)
values ('00000000-0000-0000-0000-000000667001', 'MYK9-667 Fixture Role', 'original');

-- Runs one statement as `caller` through the same role/claims PostgREST sets.
-- Returns the SQLSTATE it failed with, or 'ok:<rows affected>'. For a SELECT,
-- the row count is the number of rows the caller can see.
create function pg_temp.run_as(caller uuid, stmt text)
returns text language plpgsql as $$
declare
  v_rows bigint;
  v_state text;
begin
  perform set_config('request.jwt.claim.sub', caller::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    execute stmt;
    get diagnostics v_rows = row_count;
    v_state := 'ok:' || v_rows;
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  return v_state;
end;
$$;

create function pg_temp.expect(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: expected %, got %', label, want, got;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- Fixture control (as the table owner, RLS bypassed): every row landed and the
-- exhibitor was adopted, so no "reads 0" assertion below can pass vacuously.
do $$
begin
  if (select count(*) from public.waitlist_entries
       where id in ('00000000-0000-0000-0000-000000660081',
                    '00000000-0000-0000-0000-000000660082')) <> 2
     or (select count(*) from public.result_submissions
          where id in ('00000000-0000-0000-0000-000000660091',
                       '00000000-0000-0000-0000-000000660092')) <> 2
     or (select count(*) from public.judge_availability
          where person_id = '00000000-0000-0000-0000-000000660016') <> 1
     or (select count(*) from public.vaccinations
          where id = '00000000-0000-0000-0000-000000660071') <> 1
     or (select count(*) from public.people
          where id between '00000000-0000-0000-0000-000000660011'
                       and '00000000-0000-0000-0000-000000660015'
            and auth_user_id is not null) <> 5 then
    raise exception 'FAIL fixture did not land or signup did not adopt the seeded people';
  end if;
  raise notice 'PASS fixture control';
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Club A's admin reads Show A's waitlist and registry submissions.
-- ---------------------------------------------------------------------------
select pg_temp.expect('club A admin reads Show A waitlist',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$select id from public.waitlist_entries where id = '00000000-0000-0000-0000-000000660081'$s$),
  'ok:1');
select pg_temp.expect('club A admin reads no Show B waitlist',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$select id from public.waitlist_entries where id = '00000000-0000-0000-0000-000000660082'$s$),
  'ok:0');
select pg_temp.expect('club A admin reads Show A result submissions',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$select id from public.result_submissions where id = '00000000-0000-0000-0000-000000660091'$s$),
  'ok:1');
select pg_temp.expect('club A admin reads no Show B result submissions',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$select id from public.result_submissions where id = '00000000-0000-0000-0000-000000660092'$s$),
  'ok:0');

-- ---------------------------------------------------------------------------
-- 2. Club B's admin reads none of Show A's, and does read their own show's.
-- ---------------------------------------------------------------------------
select pg_temp.expect('club B admin reads no Show A waitlist',
  pg_temp.run_as('00000000-0000-0000-0000-000000660102',
    $s$select id from public.waitlist_entries where id = '00000000-0000-0000-0000-000000660081'$s$),
  'ok:0');
select pg_temp.expect('club B admin reads no Show A result submissions',
  pg_temp.run_as('00000000-0000-0000-0000-000000660102',
    $s$select id from public.result_submissions where id = '00000000-0000-0000-0000-000000660091'$s$),
  'ok:0');
select pg_temp.expect('club B admin reads own Show B waitlist (positive control)',
  pg_temp.run_as('00000000-0000-0000-0000-000000660102',
    $s$select id from public.waitlist_entries where id = '00000000-0000-0000-0000-000000660082'$s$),
  'ok:1');
select pg_temp.expect('club B admin reads own Show B result submissions (positive control)',
  pg_temp.run_as('00000000-0000-0000-0000-000000660102',
    $s$select id from public.result_submissions where id = '00000000-0000-0000-0000-000000660092'$s$),
  'ok:1');

-- ---------------------------------------------------------------------------
-- 3. The secretary's reads are unchanged.
-- ---------------------------------------------------------------------------
select pg_temp.expect('club A secretary reads Show A waitlist only',
  pg_temp.run_as('00000000-0000-0000-0000-000000660103',
    $s$select id from public.waitlist_entries
       where id in ('00000000-0000-0000-0000-000000660081', '00000000-0000-0000-0000-000000660082')$s$),
  'ok:1');
select pg_temp.expect('club A secretary reads Show A result submissions only',
  pg_temp.run_as('00000000-0000-0000-0000-000000660103',
    $s$select id from public.result_submissions
       where id in ('00000000-0000-0000-0000-000000660091', '00000000-0000-0000-0000-000000660092')$s$),
  'ok:1');

-- ---------------------------------------------------------------------------
-- 4. judge_availability and vaccinations are deliberately unchanged.
-- ---------------------------------------------------------------------------
select pg_temp.expect('club A admin still reads no judge availability',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$select id from public.judge_availability where person_id = '00000000-0000-0000-0000-000000660016'$s$),
  'ok:0');
select pg_temp.expect('secretary still reads judge availability',
  pg_temp.run_as('00000000-0000-0000-0000-000000660103',
    $s$select id from public.judge_availability where person_id = '00000000-0000-0000-0000-000000660016'$s$),
  'ok:1');
select pg_temp.expect('club A admin still reads no vaccinations',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$select id from public.vaccinations where id = '00000000-0000-0000-0000-000000660071'$s$),
  'ok:0');
select pg_temp.expect('secretary still reads the entered dog''s vaccination',
  pg_temp.run_as('00000000-0000-0000-0000-000000660103',
    $s$select id from public.vaccinations where id = '00000000-0000-0000-0000-000000660071'$s$),
  'ok:1');

-- ---------------------------------------------------------------------------
-- 5. volunteer_roles: site-admin writes, everyone reads.
-- ---------------------------------------------------------------------------
select pg_temp.expect('secretary reads volunteer_roles',
  pg_temp.run_as('00000000-0000-0000-0000-000000660103',
    $s$select id from public.volunteer_roles where id = '00000000-0000-0000-0000-000000667001'$s$),
  'ok:1');
select pg_temp.expect('club admin reads volunteer_roles',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$select id from public.volunteer_roles where id = '00000000-0000-0000-0000-000000667001'$s$),
  'ok:1');
select pg_temp.expect('exhibitor reads volunteer_roles',
  pg_temp.run_as('00000000-0000-0000-0000-000000660105',
    $s$select id from public.volunteer_roles where id = '00000000-0000-0000-0000-000000667001'$s$),
  'ok:1');

select pg_temp.expect('secretary cannot insert a volunteer role',
  pg_temp.run_as('00000000-0000-0000-0000-000000660103',
    $s$insert into public.volunteer_roles (name) values ('MYK9-667 secretary role')$s$),
  '42501');
select pg_temp.expect('club admin cannot insert a volunteer role',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$insert into public.volunteer_roles (name) values ('MYK9-667 club admin role')$s$),
  '42501');
-- The row is visible to both (above), so 0 rows affected is the manage policy
-- filtering the write, not the row being hidden.
select pg_temp.expect('secretary cannot update a volunteer role',
  pg_temp.run_as('00000000-0000-0000-0000-000000660103',
    $s$update public.volunteer_roles set description = 'secretary edit'
       where id = '00000000-0000-0000-0000-000000667001'$s$),
  'ok:0');
select pg_temp.expect('club admin cannot update a volunteer role',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$update public.volunteer_roles set description = 'club admin edit'
       where id = '00000000-0000-0000-0000-000000667001'$s$),
  'ok:0');
select pg_temp.expect('secretary cannot delete a volunteer role',
  pg_temp.run_as('00000000-0000-0000-0000-000000660103',
    $s$delete from public.volunteer_roles where id = '00000000-0000-0000-0000-000000667001'$s$),
  'ok:0');
select pg_temp.expect('club admin cannot delete a volunteer role',
  pg_temp.run_as('00000000-0000-0000-0000-000000660101',
    $s$delete from public.volunteer_roles where id = '00000000-0000-0000-0000-000000667001'$s$),
  'ok:0');
select pg_temp.expect('the refused writes left the row untouched',
  (select description from public.volunteer_roles where id = '00000000-0000-0000-0000-000000667001'),
  'original');

select pg_temp.expect('site admin can insert a volunteer role',
  pg_temp.run_as('00000000-0000-0000-0000-000000660104',
    $s$insert into public.volunteer_roles (id, name)
       values ('00000000-0000-0000-0000-000000667002', 'MYK9-667 site admin role')$s$),
  'ok:1');
select pg_temp.expect('site admin can update a volunteer role',
  pg_temp.run_as('00000000-0000-0000-0000-000000660104',
    $s$update public.volunteer_roles set description = 'site admin edit'
       where id = '00000000-0000-0000-0000-000000667001'$s$),
  'ok:1');
select pg_temp.expect('site admin can delete a volunteer role',
  pg_temp.run_as('00000000-0000-0000-0000-000000660104',
    $s$delete from public.volunteer_roles where id = '00000000-0000-0000-0000-000000667002'$s$),
  'ok:1');

rollback;
