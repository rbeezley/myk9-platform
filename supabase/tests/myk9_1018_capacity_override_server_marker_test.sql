-- Behavioral test for 20261005164700_myk9_1018_server_capacity_override_marker.sql
-- (MYK9-1018).
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- Rules under test:
--   1. A NON-staff caller (the dog's owner, signed in) cannot set
--      entries.capacity_override = true: a direct INSERT is refused by RLS
--      (entries_insert admits only can_manage_show) and a direct UPDATE of a row
--      the caller can see changes nothing.
--   2. A staff direct INSERT (the offline show-desk sync path: a plain PostgREST
--      insert) gets the marker from the server, never from the device:
--        - into an open spot with the device claiming true: stored false;
--        - into a FULL class with the device claiming false: stored true, and the
--          row still lands (show desk may exceed capacity);
--        - a row that holds no spot (withdrawn) is never marked.
--   3. A staff direct UPDATE cannot change the stored marker.
--   4. A definer/owner write (submit_show_entries, which decides the marker from
--      evaluate_entry_capacity itself) is not a direct client write and keeps the
--      value it wrote, even right after a direct client write in the same
--      transaction.
--
-- Fixture pattern from myk9_879_junior_declaration_test.sql.

begin;

create function pg_temp.expect(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: expected %, got %', label, want, got;
  end if;
  raise notice 'PASS %', label;
end;
$$;

create function pg_temp.as_user(p_auth uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
end;
$$;

insert into public.roles (id, name, description, is_system)
values ('00000000-0000-0000-0000-000010189801', 'secretary', 'MYK9-1018 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000010180010', 'MYK9-1018 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          junior_handler_fee, default_judge_day_capacity)
values ('00000000-0000-0000-0000-000010180101', 'MYK9-1018 Show', 'AKC',
        current_date + 20, current_date + 21, '00000000-0000-0000-0000-000010180010', 'published',
        (current_date - 10)::timestamptz, (current_date + 10)::timestamptz, 30, NULL, 125);

insert into public.trials (id, show_id, name, date, registry_id, trial_type)
values ('00000000-0000-0000-0000-000010180201', '00000000-0000-0000-0000-000010180101',
        'MYK9-1018 Trial', current_date + 20, 'AKC', 'Scent Work');

-- 301: limit 1 (the full-class case). 302: limit 5 (always open). No judge
-- assignments, so only the class limit decides. status_source 'manual' so the
-- derivation trigger cannot rewrite the fixture status.
insert into public.classes (id, trial_id, name, element, level, status, status_source,
                            entry_fee, max_entries)
values
  ('00000000-0000-0000-0000-000010180301', '00000000-0000-0000-0000-000010180201',
   'MYK9-1018 Limit One', 'Container', 'Novice', 'upcoming', 'manual', 30, 1),
  ('00000000-0000-0000-0000-000010180302', '00000000-0000-0000-0000-000010180201',
   'MYK9-1018 Limit Five', 'Interior', 'Novice', 'upcoming', 'manual', 30, 5);

-- 001 the dog owner (a plain exhibitor, no staff role), 002 the secretary.
insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000010180001', 'MYK9-1018', 'Owner', 'myk9-1018-owner@example.test'),
  ('00000000-0000-0000-0000-000010180002', 'MYK9-1018', 'Secretary', 'myk9-1018-secretary@example.test');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000010180101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1018-owner@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000010180102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1018-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

update public.people set auth_user_id = '00000000-0000-0000-0000-000010180101'
 where id = '00000000-0000-0000-0000-000010180001';
update public.people set auth_user_id = '00000000-0000-0000-0000-000010180102'
 where id = '00000000-0000-0000-0000-000010180002';

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000010180002', id, '00000000-0000-0000-0000-000010180010',
       true, '00000000-0000-0000-0000-000010180102'
from public.roles where name = 'secretary';

insert into public.dogs (id, name, call_name, breed, status, owner_id)
select ('00000000-0000-0000-0000-0000101804' || lpad(n::text, 2, '0'))::uuid,
       'MYK9-1018 Dog ' || n, 'D' || n, 'Beagle', 'active',
       '00000000-0000-0000-0000-000010180001'
from generate_series(1, 6) as n;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select d.id, 'AKC', 'SR1018' || substr(d.id::text, 35) || '01', true
from public.dogs d
where d.id::text like '00000000-0000-0000-0000-0000101804%';

select pg_temp.as_user('00000000-0000-0000-0000-000010180101');
select pg_temp.expect('FIXTURE the owner is not staff for the show',
  public.can_manage_show('00000000-0000-0000-0000-000010180101')::text, 'false');
select pg_temp.as_user('00000000-0000-0000-0000-000010180102');
select pg_temp.expect('FIXTURE the secretary is staff for the show',
  public.can_manage_show('00000000-0000-0000-0000-000010180101')::text, 'true');

-- ---------------------------------------------------------------------------
-- 2a. Staff direct insert into the open spot, device claims an override:
--     the server stores false (this entry TAKES the last spot).
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000010180102');
set local role authenticated;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
                            entry_fee, payment_status, payment_method, capacity_override)
values ('00000000-0000-0000-0000-000010180501', '00000000-0000-0000-0000-000010180401',
        '00000000-0000-0000-0000-000010180301', '00000000-0000-0000-0000-000010180101',
        '00000000-0000-0000-0000-000010180201', 'confirmed', 30, 'pending', 'check', true);
reset role;
select pg_temp.expect('a staff insert into the last open spot is not an override, whatever the device says',
  (select capacity_override::text from public.entries
    where id = '00000000-0000-0000-0000-000010180501'), 'false');

-- ---------------------------------------------------------------------------
-- 2b. The class is now full. A second desk entry made offline from a stale
--     replica claims no override: it still lands, and the server marks it.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000010180102');
set local role authenticated;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
                            entry_fee, payment_status, payment_method, capacity_override)
values ('00000000-0000-0000-0000-000010180502', '00000000-0000-0000-0000-000010180402',
        '00000000-0000-0000-0000-000010180301', '00000000-0000-0000-0000-000010180101',
        '00000000-0000-0000-0000-000010180201', 'confirmed', 30, 'pending', 'check', false);
reset role;
select pg_temp.expect('a staff insert into a full class lands and is marked as an override',
  (select capacity_override::text from public.entries
    where id = '00000000-0000-0000-0000-000010180502'), 'true');

-- 2c. A withdrawn row holds no spot: never an override, even into a full class.
select pg_temp.as_user('00000000-0000-0000-0000-000010180102');
set local role authenticated;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
                            entry_fee, payment_status, payment_method, capacity_override)
values ('00000000-0000-0000-0000-000010180503', '00000000-0000-0000-0000-000010180403',
        '00000000-0000-0000-0000-000010180301', '00000000-0000-0000-0000-000010180101',
        '00000000-0000-0000-0000-000010180201', 'withdrawn', 30, 'pending', 'check', true);
reset role;
select pg_temp.expect('a withdrawn row into a full class is not an override',
  (select capacity_override::text from public.entries
    where id = '00000000-0000-0000-0000-000010180503'), 'false');

-- ---------------------------------------------------------------------------
-- 4. An owner-role write (what a SECURITY DEFINER RPC such as
--    submit_show_entries does) keeps its own value. It runs right after a direct
--    client write in the same transaction, so a stale gate setting would show.
-- ---------------------------------------------------------------------------
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
                            entry_fee, payment_status, payment_method, capacity_override)
values ('00000000-0000-0000-0000-000010180504', '00000000-0000-0000-0000-000010180404',
        '00000000-0000-0000-0000-000010180302', '00000000-0000-0000-0000-000010180101',
        '00000000-0000-0000-0000-000010180201', 'confirmed', 30, 'pending', 'check', true);
select pg_temp.expect('a definer/owner insert keeps the value it decided',
  (select capacity_override::text from public.entries
    where id = '00000000-0000-0000-0000-000010180504'), 'true');
update public.entries set capacity_override = false
 where id = '00000000-0000-0000-0000-000010180504';
select pg_temp.expect('a definer/owner update keeps the value it wrote',
  (select capacity_override::text from public.entries
    where id = '00000000-0000-0000-0000-000010180504'), 'false');

-- ---------------------------------------------------------------------------
-- 3. A staff direct UPDATE cannot change the stored marker either way.
--    Section 4's owner-role writes ran last, leaving the gate setting 'off' in
--    this transaction, so a freeze here proves the gate fires on
--    UPDATE OF capacity_override rather than reusing an earlier 'on'.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000010180102');
set local role authenticated;
update public.entries set capacity_override = false, special_requests = 'touched-1'
 where id = '00000000-0000-0000-0000-000010180502';
update public.entries set capacity_override = true, special_requests = 'touched-2'
 where id = '00000000-0000-0000-0000-000010180501';
reset role;
-- Positive controls: both UPDATEs reached their rows (RLS did not skip them).
select pg_temp.expect('the secretary updates reached both rows',
  (select string_agg(special_requests, ',' order by id) from public.entries
    where id in ('00000000-0000-0000-0000-000010180501', '00000000-0000-0000-0000-000010180502')),
  'touched-2,touched-1');
select pg_temp.expect('a staff update cannot clear or set the marker',
  (select string_agg(capacity_override::text, ',' order by id) from public.entries
    where id in ('00000000-0000-0000-0000-000010180501', '00000000-0000-0000-0000-000010180502')),
  'false,true');

-- ---------------------------------------------------------------------------
-- 1. A non-staff caller cannot set capacity_override = true.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000010180101');
set local role authenticated;

do $$
begin
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
                              entry_fee, payment_status, payment_method, capacity_override)
  values ('00000000-0000-0000-0000-000010180505', '00000000-0000-0000-0000-000010180405',
          '00000000-0000-0000-0000-000010180302', '00000000-0000-0000-0000-000010180101',
          '00000000-0000-0000-0000-000010180201', 'confirmed', 30, 'pending', 'check', true);
  raise exception 'FAIL a non-staff caller inserted an entry with capacity_override = true';
exception
  when insufficient_privilege then
    if sqlerrm not ilike '%row-level security%' then
      raise exception 'FAIL non-staff insert refused for another reason: %', sqlerrm;
    end if;
    raise notice 'PASS a non-staff direct insert with capacity_override = true is refused by RLS';
end $$;

do $$
declare
  v_visible integer;
  v_updated integer;
begin
  -- Positive control: the owner can SEE the row (entries_select, dog owner), so
  -- zero updated rows below is the write policy, not an invisible row.
  select count(*) into v_visible from public.entries
   where id = '00000000-0000-0000-0000-000010180501';
  if v_visible <> 1 then
    raise exception 'FAIL FIXTURE the owner cannot see their own dog''s entry (% rows)', v_visible;
  end if;

  update public.entries set capacity_override = true
   where id = '00000000-0000-0000-0000-000010180501';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'FAIL a non-staff update touched % row(s)', v_updated;
  end if;
  raise notice 'PASS a non-staff direct update of capacity_override touches no row';
end $$;

reset role;
select pg_temp.expect('the non-staff update left the marker false',
  (select capacity_override::text from public.entries
    where id = '00000000-0000-0000-0000-000010180501'), 'false');
select pg_temp.expect('the refused non-staff insert left no row',
  (select count(*)::text from public.entries
    where id = '00000000-0000-0000-0000-000010180505'), '0');

rollback;
