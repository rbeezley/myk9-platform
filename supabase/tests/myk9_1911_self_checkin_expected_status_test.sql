-- MYK9-1911: self_checkin_entry refuses a write whose expected status no longer matches.
-- A Pull's Undo carries expected status 'pulled' and pull source 'exhibitor'; when another
-- operator moved the dog since, the RPC raises 55000 'Stale status' and changes nothing.
-- Executes the installed function as the real roles. Run with psql -X -v ON_ERROR_STOP=1
-- after migrations. All fixtures roll back.
begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000191101', 'MYK9-1911 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000191102', 'MYK9-1911 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000191101', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000191103', '00000000-0000-0000-0000-000000191102',
  'MYK9-1911 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000191104', '00000000-0000-0000-0000-000000191103',
  'Container Novice', 'upcoming');

-- An exhibitor (owner of the dogs) and a club-scoped secretary.
insert into public.people (id, first_name, last_name, email, auth_user_id)
values
  ('00000000-0000-0000-0000-000000191111', 'MYK9-1911', 'Owner', 'myk9-1911-owner@example.test', null),
  ('00000000-0000-0000-0000-000000191112', 'MYK9-1911', 'Secretary', 'myk9-1911-secretary@example.test', null);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000191191', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1911-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000191192', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1911-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);
update public.people
   set auth_user_id = case email
     when 'myk9-1911-owner@example.test' then '00000000-0000-0000-0000-000000191191'::uuid
     when 'myk9-1911-secretary@example.test' then '00000000-0000-0000-0000-000000191192'::uuid
   end
 where email in ('myk9-1911-owner@example.test', 'myk9-1911-secretary@example.test');
insert into public.user_roles (user_id, role_id, is_active, granted_by, auth_user_id, club_id)
select '00000000-0000-0000-0000-000000191112', id, true,
  '00000000-0000-0000-0000-000000191112', '00000000-0000-0000-0000-000000191192',
  '00000000-0000-0000-0000-000000191101'
from public.roles where name = 'secretary';

insert into public.dogs (id, name, call_name, breed, owner_id)
select ('00000000-0000-0000-0000-00000019112' || n)::uuid, 'MYK9-1911 Dog ' || n, 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000191111'
from generate_series(1, 2) n;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select ('00000000-0000-0000-0000-00000019112' || n)::uuid, 'AKC (American Kennel Club)',
  'SR19112' || n, true
from generate_series(1, 2) n;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
select ('00000000-0000-0000-0000-00000019113' || n)::uuid,
  ('00000000-0000-0000-0000-00000019112' || n)::uuid,
  '00000000-0000-0000-0000-000000191104', '00000000-0000-0000-0000-000000191102',
  '00000000-0000-0000-0000-000000191103', '00000000-0000-0000-0000-000000191111',
  'confirmed', 'pending', 25, 'checked-in'
from generate_series(1, 2) n;

create function pg_temp.fail_if(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond then raise exception 'FAIL %', msg; end if;
end;
$$;

create function pg_temp.row_of(p_id uuid) returns text
language sql as $$
  select concat_ws('/', check_in_status, coalesce(check_in_pulled_by, '-'))
  from public.entries where id = p_id;
$$;

create function pg_temp.act_as(p_auth text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;



-- A matching Undo is applied: Pull, then Undo expecting that Pull.
do $$
declare
  v_a constant uuid := '00000000-0000-0000-0000-000000191731';
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000000191791');
  perform public.self_checkin_entry(v_a, 'pulled');
  perform public.self_checkin_entry(v_a, 'checked-in', 'pulled', 'exhibitor');
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_a) is distinct from 'checked-in/-',
    'a matching Undo was not applied: ' || pg_temp.row_of(v_a));

  -- The two-argument call shape still works (no expectation, no check).
  perform pg_temp.act_as('00000000-0000-0000-0000-000000191791');
  perform public.self_checkin_entry(v_a, 'at-gate');
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_a) is distinct from 'at-gate/-',
    'the two-argument call no longer writes: ' || pg_temp.row_of(v_a));

  raise notice 'PASS a matching Undo is applied and the old call shape still works';
end;
$$;

-- A superseded Undo is refused with 55000 and the row is untouched.
do $$
declare
  v_b constant uuid := '00000000-0000-0000-0000-000000191732';
  v_state text;
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000000191791');
  perform public.self_checkin_entry(v_b, 'pulled');
  reset role;
  -- Staff moves the dog into the ring after the Pull.
  update public.entries set check_in_status = 'in-ring' where id = v_b;
  v_state := pg_temp.row_of(v_b);

  perform pg_temp.act_as('00000000-0000-0000-0000-000000191791');
  begin
    perform public.self_checkin_entry(v_b, 'checked-in', 'pulled', 'exhibitor');
    reset role;
    raise exception 'FAIL a stale Undo was not refused';
  exception when sqlstate '55000' then
    reset role;
    perform pg_temp.fail_if(sqlerrm not like 'Stale status:%', 'wrong refusal message: ' || sqlerrm);
  end;
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from v_state,
    'a refused Undo changed the row: ' || pg_temp.row_of(v_b));

  raise notice 'PASS a superseded Undo is refused and changes nothing';
end;
$$;

-- A staff re-Pull (source staff) refuses an exhibitor Undo that expects its own Pull.
do $$
declare
  v_b constant uuid := '00000000-0000-0000-0000-000000191732';
begin
  update public.entries set check_in_status = 'checked-in' where id = v_b;
  update public.entries set check_in_status = 'pulled' where id = v_b;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from 'pulled/staff',
    'fixture: ' || pg_temp.row_of(v_b));

  perform pg_temp.act_as('00000000-0000-0000-0000-000000191791');
  begin
    perform public.self_checkin_entry(v_b, 'checked-in', 'pulled', 'exhibitor');
    reset role;
    raise exception 'FAIL an Undo of a different Pull source was not refused';
  exception when sqlstate '55000' then
    reset role;
  end;
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from 'pulled/staff',
    'a refused Undo changed the row: ' || pg_temp.row_of(v_b));

  raise notice 'PASS an Undo expecting a different Pull source is refused';
end;
$$;

-- Ownership still comes first: a stranger gets the authorization error, not Stale status.
do $$
declare
  v_b constant uuid := '00000000-0000-0000-0000-000000191732';
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000000191792');
  begin
    perform public.self_checkin_entry(v_b, 'checked-in', 'pulled', 'staff');
    reset role;
    raise exception 'FAIL a non-owner was not refused';
  exception when others then
    reset role;
    perform pg_temp.fail_if(sqlerrm not like 'Not authorized:%', 'wrong refusal for a non-owner: ' || sqlerrm);
  end;

  raise notice 'PASS ownership is checked before the expectation';
end;
$$;

-- The ACL is the one the previous definition carried.
do $$
begin
  perform pg_temp.fail_if(
    not has_function_privilege('authenticated', 'public.self_checkin_entry(uuid, text, text, text)', 'execute'),
    'authenticated lost execute');
  perform pg_temp.fail_if(
    has_function_privilege('anon', 'public.self_checkin_entry(uuid, text, text, text)', 'execute'),
    'anon gained execute');
  perform pg_temp.fail_if(
    to_regprocedure('public.self_checkin_entry(uuid, text)') is not null,
    'the old two-argument signature still exists beside the new one');

  raise notice 'PASS ACL unchanged and one signature';
end;
$$;

rollback;
