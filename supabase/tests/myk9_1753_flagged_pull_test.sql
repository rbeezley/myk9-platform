-- MYK9-1753: who flagged a pull (entries.check_in_pulled_by, stamped by the
-- MYK9-1396 trigger) and the secretary's Clear (public.clear_flagged_pull).
-- Executes the installed functions as the real roles. Run with
-- psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000175301', 'MYK9-1753 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000175302', 'MYK9-1753 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000175301', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000175303', '00000000-0000-0000-0000-000000175302',
  'MYK9-1753 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000175304', '00000000-0000-0000-0000-000000175303',
  'Container Novice', 'upcoming');

-- An exhibitor (owner of the dogs) and a club-scoped secretary.
insert into public.people (id, first_name, last_name, email, auth_user_id)
values
  ('00000000-0000-0000-0000-000000175311', 'MYK9-1753', 'Owner', 'myk9-1753-owner@example.test', null),
  ('00000000-0000-0000-0000-000000175312', 'MYK9-1753', 'Secretary', 'myk9-1753-secretary@example.test', null);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000175391', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1753-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000175392', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1753-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);
update public.people
   set auth_user_id = case email
     when 'myk9-1753-owner@example.test' then '00000000-0000-0000-0000-000000175391'::uuid
     when 'myk9-1753-secretary@example.test' then '00000000-0000-0000-0000-000000175392'::uuid
   end
 where email in ('myk9-1753-owner@example.test', 'myk9-1753-secretary@example.test');
insert into public.user_roles (user_id, role_id, is_active, granted_by, auth_user_id, club_id)
select '00000000-0000-0000-0000-000000175312', id, true,
  '00000000-0000-0000-0000-000000175312', '00000000-0000-0000-0000-000000175392',
  '00000000-0000-0000-0000-000000175301'
from public.roles where name = 'secretary';

insert into public.dogs (id, name, call_name, breed, owner_id)
select ('00000000-0000-0000-0000-00000017532' || n)::uuid, 'MYK9-1753 Dog ' || n, 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000175311'
from generate_series(1, 2) n;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select ('00000000-0000-0000-0000-00000017532' || n)::uuid, 'AKC (American Kennel Club)',
  'SR17532' || n, true
from generate_series(1, 2) n;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
select ('00000000-0000-0000-0000-00000017533' || n)::uuid,
  ('00000000-0000-0000-0000-00000017532' || n)::uuid,
  '00000000-0000-0000-0000-000000175304', '00000000-0000-0000-0000-000000175302',
  '00000000-0000-0000-0000-000000175303', '00000000-0000-0000-0000-000000175311',
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
  select concat_ws('/', check_in_status, coalesce(check_in_status_before_pull, '-'),
    coalesce(check_in_pulled_by, '-'))
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

-- Who flagged it.
do $$
declare
  v_mine constant uuid := '00000000-0000-0000-0000-000000175331';
  v_other constant uuid := '00000000-0000-0000-0000-000000175332';
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175391');
  perform public.self_checkin_entry(v_mine, 'pulled');
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_mine) is distinct from 'pulled/checked-in/exhibitor',
    'an exhibitor Pulled stored ' || pg_temp.row_of(v_mine));

  -- The marker does not outlive the RPC: a later write in the same transaction is staff.
  update public.entries set check_in_status = 'pulled' where id = v_other;
  perform pg_temp.fail_if(pg_temp.row_of(v_other) is distinct from 'pulled/checked-in/staff',
    'a staff Pulled after the RPC stored ' || pg_temp.row_of(v_other));

  -- A planted source is discarded, alone or alongside check_in_status.
  update public.entries set check_in_pulled_by = 'exhibitor' where id = v_other;
  update public.entries set check_in_status = 'pulled', check_in_pulled_by = 'exhibitor'
   where id = v_other;
  perform pg_temp.fail_if(pg_temp.row_of(v_other) is distinct from 'pulled/checked-in/staff',
    'a planted source survived: ' || pg_temp.row_of(v_other));

  -- Moving off pulled clears the source with the prior.
  update public.entries set check_in_status = 'conflict' where id = v_other;
  perform pg_temp.fail_if(pg_temp.row_of(v_other) is distinct from 'conflict/-/-',
    'a move off pulled left ' || pg_temp.row_of(v_other));

  -- An exhibitor's other statuses never carry a source.
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175391');
  perform public.self_checkin_entry(v_other, 'at-gate');
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_other) is distinct from 'at-gate/-/-',
    'an exhibitor at-gate stored ' || pg_temp.row_of(v_other));

  raise notice 'PASS check_in_pulled_by records exhibitor vs staff and discards plants';
end;
$$;

-- Clear: secretary only, restores the remembered check-in, refuses anything else.
do $$
declare
  v_mine constant uuid := '00000000-0000-0000-0000-000000175331';
  v_other constant uuid := '00000000-0000-0000-0000-000000175332';
  v_result text;
  v_state text;
begin
  -- The exhibitor cannot clear their own flag here.
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175391');
  begin
    perform public.clear_flagged_pull(v_mine);
  exception when others then v_state := sqlstate;
  end;
  reset role;
  perform pg_temp.fail_if(v_state is distinct from '42501',
    'a non-manager Clear raised ' || coalesce(v_state, 'nothing'));
  perform pg_temp.fail_if(pg_temp.row_of(v_mine) is distinct from 'pulled/checked-in/exhibitor',
    'a refused Clear changed the row: ' || pg_temp.row_of(v_mine));

  -- The secretary clears it back to checked-in.
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175392');
  v_result := public.clear_flagged_pull(v_mine);
  reset role;
  perform pg_temp.fail_if(v_result is distinct from 'checked-in',
    'Clear returned ' || coalesce(v_result, 'NULL'));
  perform pg_temp.fail_if(pg_temp.row_of(v_mine) is distinct from 'checked-in/-/-',
    'Clear left ' || pg_temp.row_of(v_mine));

  -- A ring state comes back as checked-in.
  update public.entries set check_in_status = 'pulled' where id = v_other; -- from at-gate
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175392');
  v_result := public.clear_flagged_pull(v_other);
  reset role;
  perform pg_temp.fail_if(v_result is distinct from 'checked-in',
    'Clear of a flag set at the gate returned ' || coalesce(v_result, 'NULL'));

  -- Never checked in comes back not checked in.
  update public.entries set check_in_status = 'no-status' where id = v_other;
  update public.entries set check_in_status = 'pulled' where id = v_other;
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175392');
  v_result := public.clear_flagged_pull(v_other);
  reset role;
  perform pg_temp.fail_if(v_result is distinct from 'no-status',
    'Clear of a never-checked-in flag returned ' || coalesce(v_result, 'NULL'));

  -- A real Pull (scratched) and a class no longer pulled are refused, unchanged.
  update public.entries set entry_status = 'scratched', check_in_status = 'pulled' where id = v_other;
  v_state := null;
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175392');
  begin
    perform public.clear_flagged_pull(v_other);
  exception when others then v_state := sqlstate;
  end;
  reset role;
  perform pg_temp.fail_if(v_state is distinct from 'P0001',
    'Clear of a real Pull raised ' || coalesce(v_state, 'nothing'));
  perform pg_temp.fail_if(pg_temp.row_of(v_other) is distinct from 'pulled/no-status/staff',
    'a refused Clear of a real Pull changed it: ' || pg_temp.row_of(v_other));

  v_state := null;
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175392');
  begin
    perform public.clear_flagged_pull(v_mine);
  exception when others then v_state := sqlstate;
  end;
  reset role;
  perform pg_temp.fail_if(v_state is distinct from 'P0001',
    'Clear of a class that is not pulled raised ' || coalesce(v_state, 'nothing'));

  raise notice 'PASS clear_flagged_pull is manager-only and restores the remembered check-in';
end;
$$;

rollback;
