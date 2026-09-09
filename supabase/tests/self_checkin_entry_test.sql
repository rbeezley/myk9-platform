-- MYK9-452: execute the installed function, not a source-string contract.
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000452001', 'MYK9-452 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000452002', 'MYK9-452 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000452001', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000452003', '00000000-0000-0000-0000-000000452002',
  'MYK9-452 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000452004', '00000000-0000-0000-0000-000000452003',
  'Container Novice', 'upcoming');

-- Owner, co-owner, handler and outsider have distinct person/auth identities.
insert into public.people (id, first_name, last_name, auth_user_id)
select ('00000000-0000-0000-0000-00000045201' || n)::uuid, 'MYK9-452', 'Person ' || n,
  ('00000000-0000-0000-0000-00000045210' || n)::uuid
from generate_series(1, 4) n;
insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
values ('00000000-0000-0000-0000-000000452021', 'MYK9-452 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000452011', '00000000-0000-0000-0000-000000452012'),
  ('00000000-0000-0000-0000-000000452022', 'MYK9-452 Other Dog', 'Other', 'Beagle',
  '00000000-0000-0000-0000-000000452011', null);
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000452021', 'AKC (American Kennel Club)', 'SR452021', true),
  ('00000000-0000-0000-0000-000000452022', 'AKC (American Kennel Club)', 'SR452022', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
select ('00000000-0000-0000-0000-00000045203' || n)::uuid,
  ('00000000-0000-0000-0000-00000045202' || n)::uuid,
  '00000000-0000-0000-0000-000000452004', '00000000-0000-0000-0000-000000452002',
  '00000000-0000-0000-0000-000000452003', '00000000-0000-0000-0000-000000452013',
  'confirmed', 'pending', 25, 'no-status'
from generate_series(1, 2) n;

-- Invoker helper: fixtures/read-back run as postgres, but the RPC itself always
-- runs as authenticated/anon. No test-only grants to the production function.
create function pg_temp.assert_self_checkin(
  label text, caller text, new_status text, expected_error text default null,
  caller_role text default 'authenticated',
  target_id uuid default '00000000-0000-0000-0000-000000452031'
) returns void language plpgsql as $$
declare
  before_rows jsonb;
  after_rows jsonb;
  actual_error text;
  actual_state text;
  expected_rows jsonb;
begin
  update public.entries set check_in_status = 'no-status'
  where id = '00000000-0000-0000-0000-000000452031';
  select jsonb_object_agg(id::text, to_jsonb(e)) into before_rows
  from public.entries e where show_id = '00000000-0000-0000-0000-000000452002';

  perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', caller_role)::text, true);
  perform set_config('role', caller_role, true);
  begin
    perform public.self_checkin_entry(target_id, new_status);
  exception when others then
    actual_error := sqlerrm;
    actual_state := sqlstate;
  end;
  reset role;

  if expected_error is null and actual_error is not null then
    raise exception 'FAIL %: unexpected SQLSTATE %: %', label, actual_state, actual_error;
  end if;
  if expected_error is not null and (
    actual_error is null or actual_error not like expected_error
    or actual_state <> case when caller_role = 'anon' then '42501' else 'P0001' end
  ) then
    raise exception 'FAIL %: expected %, got SQLSTATE %: %',
      label, expected_error, actual_state, actual_error;
  end if;

  select jsonb_object_agg(id::text, to_jsonb(e)) into after_rows
  from public.entries e where show_id = '00000000-0000-0000-0000-000000452002';
  if expected_error is not null then
    if after_rows is distinct from before_rows then
      raise exception 'FAIL %: denied call changed persisted entry data', label;
    end if;
  else
    -- Only status, updated_at and the existing replication version increment
    -- may change. The version assertion also proves exactly one UPDATE.
    expected_rows := jsonb_set(before_rows,
      array[target_id::text, 'check_in_status'], to_jsonb(new_status));
    expected_rows := jsonb_set(expected_rows,
      array[target_id::text, 'updated_at'], after_rows #> array[target_id::text, 'updated_at']);
    expected_rows := jsonb_set(expected_rows,
      array[target_id::text, 'version'],
      to_jsonb((before_rows #>> array[target_id::text, 'version'])::integer + 1));
    if after_rows is distinct from expected_rows then
      raise exception 'FAIL %: persisted status/other fields differ from expected', label;
    end if;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- Missing settings must preserve the default-enabled behavior.
delete from public.class_visibility_overrides where class_id = '00000000-0000-0000-0000-000000452004';
delete from public.trial_visibility_overrides where trial_id = '00000000-0000-0000-0000-000000452003';
delete from public.show_visibility_settings where show_id = '00000000-0000-0000-0000-000000452002';

-- RED on 20260908134900: valid owner reaches SQLSTATE 42P01 here.
select pg_temp.assert_self_checkin('owner / absent settings',
  '00000000-0000-0000-0000-000000452101', 'checked-in');
select pg_temp.assert_self_checkin('co-owner',
  '00000000-0000-0000-0000-000000452102', 'checked-in');
select pg_temp.assert_self_checkin('handler',
  '00000000-0000-0000-0000-000000452103', 'checked-in');
select pg_temp.assert_self_checkin('outsider',
  '00000000-0000-0000-0000-000000452104', 'checked-in', 'Not authorized: caller does not own entry %');
select pg_temp.assert_self_checkin('unlinked authenticated caller',
  '00000000-0000-0000-0000-000000452105', 'checked-in', 'Not authorized: caller is not linked%');
select pg_temp.assert_self_checkin('anonymous', null, 'checked-in',
  'permission denied for function self_checkin_entry', 'anon');
select pg_temp.assert_self_checkin('authenticated without identity', null, 'checked-in',
  'Not authorized: caller is not linked%');
select pg_temp.assert_self_checkin('NULL status',
  '00000000-0000-0000-0000-000000452101', null, 'Status <NULL> is not allowed%');
select pg_temp.assert_self_checkin('unsupported status',
  '00000000-0000-0000-0000-000000452101', 'in-ring', 'Status in-ring is not allowed%');
select pg_temp.assert_self_checkin('nonexistent entry',
  '00000000-0000-0000-0000-000000452101', 'checked-in',
  'Not authorized: caller does not own entry %', 'authenticated',
  '00000000-0000-0000-0000-000000452099');

select pg_temp.assert_self_checkin('allowed status ' || status,
  '00000000-0000-0000-0000-000000452101', status)
from unnest(array['checked-in', 'conflict', 'pulled', 'at-gate', 'no-status']) status;

-- All 18 show/trial/class combinations, including explicit NULL inheritance.
-- The expected result uses independent branching rather than the RPC COALESCE.
do $$
declare
  s boolean;
  t boolean;
  c boolean;
  enabled boolean;
  caller text;
begin
  foreach s in array array[false, true] loop
    foreach t in array array[null::boolean, false, true] loop
      foreach c in array array[null::boolean, false, true] loop
        insert into public.show_visibility_settings (show_id, self_checkin_enabled)
        values ('00000000-0000-0000-0000-000000452002', s)
        on conflict (show_id) do update set self_checkin_enabled = excluded.self_checkin_enabled;
        insert into public.trial_visibility_overrides (trial_id, self_checkin_enabled)
        values ('00000000-0000-0000-0000-000000452003', t)
        on conflict (trial_id) do update set self_checkin_enabled = excluded.self_checkin_enabled;
        insert into public.class_visibility_overrides (class_id, self_checkin_enabled)
        values ('00000000-0000-0000-0000-000000452004', c)
        on conflict (class_id) do update set self_checkin_enabled = excluded.self_checkin_enabled;
        if c is not null then enabled := c;
        elsif t is not null then enabled := t;
        else enabled := s;
        end if;
        foreach caller in array array[
          '00000000-0000-0000-0000-000000452101',
          '00000000-0000-0000-0000-000000452102',
          '00000000-0000-0000-0000-000000452103'
        ] loop
          perform pg_temp.assert_self_checkin(
            format('show=%s trial=%s class=%s caller=%s', s, t, c, caller),
            caller, 'checked-in',
            case when enabled then null else 'Not authorized: caller does not own entry %' end);
        end loop;
      end loop;
    end loop;
  end loop;
end;
$$;

rollback;
