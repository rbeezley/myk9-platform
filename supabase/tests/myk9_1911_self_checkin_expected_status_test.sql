-- MYK9-1911: self_checkin_entry's optional expected-status predicate. A Pull Undo that carries
-- the status and pull source it expects to replace is applied when the row still matches and
-- refused (SQLSTATE MK911, nothing written) when a newer status superseded it.
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
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
insert into public.people (id, first_name, last_name, auth_user_id)
values ('00000000-0000-0000-0000-000000191111', 'MYK9-1911', 'Owner',
  '00000000-0000-0000-0000-000000191191'),
  ('00000000-0000-0000-0000-000000191112', 'MYK9-1911', 'Outsider',
  '00000000-0000-0000-0000-000000191192');
insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000191121', 'MYK9-1911 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000191111');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000191121', 'AKC (American Kennel Club)', 'SR191121', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values ('00000000-0000-0000-0000-000000191131', '00000000-0000-0000-0000-000000191121',
  '00000000-0000-0000-0000-000000191104', '00000000-0000-0000-0000-000000191102',
  '00000000-0000-0000-0000-000000191103', '00000000-0000-0000-0000-000000191111',
  'confirmed', 'pending', 25, 'checked-in');

-- Calls the RPC as the exhibitor (or another caller) and returns the SQLSTATE, null on success.
create function pg_temp.call_rpc(
  caller text, new_status text, expected_status text default null, expected_source text default null
) returns text language plpgsql as $$
declare
  actual_state text;
begin
  perform set_config('request.jwt.claim.sub', caller, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.self_checkin_entry('00000000-0000-0000-0000-000000191131',
      new_status, expected_status, expected_source);
  exception when others then
    actual_state := sqlstate;
  end;
  reset role;
  return actual_state;
end;
$$;

create function pg_temp.status_now() returns text language sql as $$
  select check_in_status from public.entries where id = '00000000-0000-0000-0000-000000191131'
$$;

do $$
declare
  v_owner constant text := '00000000-0000-0000-0000-000000191191';
  v_outsider constant text := '00000000-0000-0000-0000-000000191192';
  v_state text;
  v_version integer;
  v_updated_at timestamptz;
begin
  -- The exhibitor pulls the dog (no expectation, as before).
  if pg_temp.call_rpc(v_owner, 'pulled') is not null then
    raise exception 'FAIL exhibitor pull without expectations was refused';
  end if;

  -- Matching Undo: expects pulled by the exhibitor, applied.
  v_state := pg_temp.call_rpc(v_owner, 'checked-in', 'pulled', 'exhibitor');
  if v_state is not null or pg_temp.status_now() <> 'checked-in' then
    raise exception 'FAIL matching Undo: state %, status %', v_state, pg_temp.status_now();
  end if;
  raise notice 'PASS matching Undo is applied';

  -- Staff moves the dog to in-ring; the stale Undo then replays and must change nothing.
  perform pg_temp.call_rpc(v_owner, 'pulled');
  update public.entries set check_in_status = 'in-ring'
   where id = '00000000-0000-0000-0000-000000191131';
  select version, updated_at into v_version, v_updated_at
    from public.entries where id = '00000000-0000-0000-0000-000000191131';
  v_state := pg_temp.call_rpc(v_owner, 'checked-in', 'pulled', 'exhibitor');
  if v_state is distinct from 'MK911' then
    raise exception 'FAIL superseded Undo: expected MK911, got %', v_state;
  end if;
  if pg_temp.status_now() <> 'in-ring'
     or (select version from public.entries where id = '00000000-0000-0000-0000-000000191131') <> v_version
     or (select updated_at from public.entries where id = '00000000-0000-0000-0000-000000191131') <> v_updated_at then
    raise exception 'FAIL superseded Undo changed the row';
  end if;
  raise notice 'PASS superseded Undo is refused and changes nothing';

  -- Pulled again, but by staff: an exhibitor Undo that expects its own Pull is refused.
  update public.entries set check_in_status = 'pulled'
   where id = '00000000-0000-0000-0000-000000191131';
  v_state := pg_temp.call_rpc(v_owner, 'checked-in', 'pulled', 'exhibitor');
  if v_state is distinct from 'MK911' or pg_temp.status_now() <> 'pulled' then
    raise exception 'FAIL Undo of a staff Pull: state %, status %', v_state, pg_temp.status_now();
  end if;
  raise notice 'PASS Undo of a Pull by someone else is refused';

  -- A non-owner learns nothing about the row: authorization refusal, not MK911.
  v_state := pg_temp.call_rpc(v_outsider, 'checked-in', 'in-ring', null);
  if v_state is distinct from 'P0001' then
    raise exception 'FAIL outsider got %, expected the P0001 authorization refusal', v_state;
  end if;
  raise notice 'PASS outsider is refused as unauthorized, not as stale';
end;
$$;

-- Grants unchanged in shape: authenticated only, never anon or public.
do $$
begin
  if has_function_privilege('anon', 'public.self_checkin_entry(uuid, text, text, text)', 'execute')
     or has_function_privilege('public', 'public.self_checkin_entry(uuid, text, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.self_checkin_entry(uuid, text, text, text)', 'execute') then
    raise exception 'FAIL self_checkin_entry grants drifted';
  end if;
  if to_regprocedure('public.self_checkin_entry(uuid, text)') is not null then
    raise exception 'FAIL the old two-argument overload still exists';
  end if;
  raise notice 'PASS grants and single overload';
end;
$$;

rollback;
