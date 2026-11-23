-- MYK9-2341: server-only columns are not client-writable
-- (20261123221500_myk9_2341_server_only_column_guards.sql).
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; the fixture rolls back.
--
--   A. an authenticated secretary UPDATE cannot change entries.reminder_email_*, while an
--      ordinary column in the same UPDATE still changes;
--   B. an authenticated entries INSERT naming them gets the defaults (NULL, 'pending');
--   C. service_role can write entries.reminder_email_*;
--   D. an authenticated club admin cannot change or clear clubs.first_show_published_at, while
--      an ordinary column in the same UPDATE still changes;
--   E. an authenticated clubs INSERT naming first_show_published_at gets NULL;
--   F. service_role can write clubs.first_show_published_at, and the SECURITY DEFINER stamp
--      trigger still stamps through a real publish;
--   G. request_new_club pins pg_temp; review_club_access_request is closed to PUBLIC and anon.

begin;

insert into public.clubs (id, name, authorized_at) values
  ('00000000-0000-0000-0000-000002341001', 'MYK9-2341 Club', now()),
  ('00000000-0000-0000-0000-000002341002', 'MYK9-2341 Stamp Club', now());
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002341002', 'MYK9-2341 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002341001', 'published');
insert into public.trials (id, show_id, name, date, registry_id) values
  ('00000000-0000-0000-0000-000002341003', '00000000-0000-0000-0000-000002341002',
   'MYK9-2341 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status, status_source) values
  ('00000000-0000-0000-0000-000002341004', '00000000-0000-0000-0000-000002341003', 'Class', 'upcoming', 'manual'),
  ('00000000-0000-0000-0000-000002341005', '00000000-0000-0000-0000-000002341003', 'Class B', 'upcoming', 'manual');
insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000002341011', 'MYK9-2341', 'Owner', '00000000-0000-0000-0000-000002341101'),
  ('00000000-0000-0000-0000-000002341013', 'MYK9-2341', 'Secretary', '00000000-0000-0000-0000-000002341102'),
  ('00000000-0000-0000-0000-000002341014', 'MYK9-2341', 'ClubAdmin', '00000000-0000-0000-0000-000002341103');
insert into public.roles (id, name, description, is_system)
values ('00000000-0000-0000-0000-000002341801', 'secretary', 'MYK9-2341 fixture', true)
on conflict (name) do nothing;
insert into public.roles (id, name, description, is_system)
values ('00000000-0000-0000-0000-000002341802', 'club_admin', 'MYK9-2341 fixture', true)
on conflict (name) do nothing;
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000002341013', id, '00000000-0000-0000-0000-000002341001', true,
  '00000000-0000-0000-0000-000002341102'
from public.roles where name = 'secretary';
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000002341014', id, '00000000-0000-0000-0000-000002341001', true,
  '00000000-0000-0000-0000-000002341103'
from public.roles where name = 'club_admin';
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002341012', 'MYK9-2341 Dog', 'Dog', 'Beagle', '00000000-0000-0000-0000-000002341011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary) values
  ('00000000-0000-0000-0000-000002341012', 'AKC (American Kennel Club)', 'SR2341', true);

insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee) values
  ('00000000-0000-0000-0000-000002341021', '00000000-0000-0000-0000-000002341012',
   '00000000-0000-0000-0000-000002341004', '00000000-0000-0000-0000-000002341002',
   '00000000-0000-0000-0000-000002341003', 'confirmed', 'pending', 25);

do $$
declare
  r record;
  c record;
  n bigint;
  stamp constant timestamptz := '2026-11-01 12:00:00+00';
begin
  -- A. a secretary tries to suppress the reminder, then to re-arm it.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002341102', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000002341102', 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.entries
     set reminder_email_status = 'sent', reminder_email_sent_at = now(), armband = '777'
   where id = '00000000-0000-0000-0000-000002341021';
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then
    raise exception 'FAIL A: the secretary UPDATE matched % rows; RLS did not admit the caller', n;
  end if;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000002341021';
  if r.reminder_email_status <> 'pending' or r.reminder_email_sent_at is not null then
    raise exception 'FAIL A: client suppressed the reminder (% / %)', r.reminder_email_status, r.reminder_email_sent_at;
  end if;
  if r.armband is distinct from '777' then
    raise exception 'FAIL A: the guard swallowed the ordinary column (armband %)', r.armband;
  end if;

  -- C. service_role stamps it.
  set local role service_role;
  update public.entries set reminder_email_status = 'sent', reminder_email_sent_at = stamp
   where id = '00000000-0000-0000-0000-000002341021';
  reset role;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000002341021';
  if r.reminder_email_status <> 'sent' or r.reminder_email_sent_at is distinct from stamp then
    raise exception 'FAIL C: service_role could not write the reminder columns (% / %)', r.reminder_email_status, r.reminder_email_sent_at;
  end if;

  -- A2. the secretary now tries to re-arm the sent reminder.
  set local role authenticated;
  update public.entries set reminder_email_status = 'pending', reminder_email_sent_at = null
   where id = '00000000-0000-0000-0000-000002341021';
  reset role;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000002341021';
  if r.reminder_email_status <> 'sent' or r.reminder_email_sent_at is distinct from stamp then
    raise exception 'FAIL A2: client re-armed the reminder (% / %)', r.reminder_email_status, r.reminder_email_sent_at;
  end if;
  raise notice 'PASS A, A2, C: entries.reminder_email_* are client-immutable and service-writable';

  -- B. a client INSERT naming them gets the defaults.
  set local role authenticated;
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
    reminder_email_status, reminder_email_sent_at) values
    ('00000000-0000-0000-0000-000002341022', '00000000-0000-0000-0000-000002341012',
     '00000000-0000-0000-0000-000002341005', '00000000-0000-0000-0000-000002341002',
     '00000000-0000-0000-0000-000002341003', 'confirmed', 'pending', 25, 'sent', now());
  reset role;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000002341022';
  if r.reminder_email_status <> 'pending' or r.reminder_email_sent_at is not null then
    raise exception 'FAIL B: client INSERT set the reminder columns (% / %)', r.reminder_email_status, r.reminder_email_sent_at;
  end if;
  raise notice 'PASS B: authenticated INSERT gets the defaults';

  -- D. a club admin tries to clear and to move the stamp.
  update public.clubs set first_show_published_at = stamp
   where id = '00000000-0000-0000-0000-000002341001';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002341103', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000002341103', 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.clubs set first_show_published_at = null, website = 'https://example.test'
   where id = '00000000-0000-0000-0000-000002341001';
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then
    raise exception 'FAIL D: the club admin UPDATE matched % rows; RLS did not admit the caller', n;
  end if;
  select * into c from public.clubs where id = '00000000-0000-0000-0000-000002341001';
  if c.first_show_published_at is distinct from stamp then
    raise exception 'FAIL D: club admin cleared first_show_published_at (%)', c.first_show_published_at;
  end if;
  if c.website is distinct from 'https://example.test' then
    raise exception 'FAIL D: the guard swallowed the ordinary column (website %)', c.website;
  end if;
  set local role authenticated;
  update public.clubs set first_show_published_at = now() + interval '5 years'
   where id = '00000000-0000-0000-0000-000002341001';
  reset role;
  select * into c from public.clubs where id = '00000000-0000-0000-0000-000002341001';
  if c.first_show_published_at is distinct from stamp then
    raise exception 'FAIL D: club admin moved first_show_published_at (%)', c.first_show_published_at;
  end if;
  raise notice 'PASS D: clubs.first_show_published_at is client-immutable';

  -- E. a client INSERT naming it gets NULL.
  set local role authenticated;
  insert into public.clubs (id, name, first_show_published_at)
  values ('00000000-0000-0000-0000-000002341003', 'MYK9-2341 Client Insert', now());
  reset role;
  select * into c from public.clubs where id = '00000000-0000-0000-0000-000002341003';
  if c.first_show_published_at is not null then
    raise exception 'FAIL E: client INSERT set first_show_published_at (%)', c.first_show_published_at;
  end if;
  raise notice 'PASS E: authenticated clubs INSERT gets NULL';

  -- F. service_role may write it; the definer stamp trigger still stamps.
  set local role service_role;
  update public.clubs set first_show_published_at = stamp
   where id = '00000000-0000-0000-0000-000002341002';
  reset role;
  select * into c from public.clubs where id = '00000000-0000-0000-0000-000002341002';
  if c.first_show_published_at is distinct from stamp then
    raise exception 'FAIL F: service_role could not write first_show_published_at (%)', c.first_show_published_at;
  end if;
  update public.clubs set first_show_published_at = null
   where id = '00000000-0000-0000-0000-000002341002';
  insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
    ('00000000-0000-0000-0000-000002341006', 'MYK9-2341 Stamp Show', 'AKC', current_date, current_date,
     '00000000-0000-0000-0000-000002341002', 'published');
  select * into c from public.clubs where id = '00000000-0000-0000-0000-000002341002';
  if c.first_show_published_at is null then
    raise exception 'FAIL F: the stamp trigger no longer stamps through the guard';
  end if;
  raise notice 'PASS F: service_role and the stamp trigger still write first_show_published_at';

  -- G. function hardening.
  if not exists (
    select 1 from pg_proc
    where oid = 'public.request_new_club(text, jsonb, text, text)'::regprocedure
      and proconfig @> array['search_path=public, pg_temp']
  ) then
    raise exception 'FAIL G: request_new_club search_path is not public, pg_temp';
  end if;
  if has_function_privilege('anon', 'public.review_club_access_request(uuid, text, uuid, text, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.review_club_access_request(uuid, text, uuid, text, text)', 'EXECUTE')
     or exists (
       select 1 from pg_proc p, aclexplode(p.proacl) a
       where p.oid = 'public.review_club_access_request(uuid, text, uuid, text, text)'::regprocedure
         and a.grantee = 0
     ) then
    raise exception 'FAIL G: review_club_access_request is not authenticated-only';
  end if;
  raise notice 'PASS G: function hardening';
end;
$$;

rollback;
