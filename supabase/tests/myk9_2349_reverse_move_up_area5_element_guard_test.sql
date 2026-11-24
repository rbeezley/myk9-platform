-- MYK9-2349: reverse_move_up_entry refuses once the destination holds an
-- area5_time_seconds or element_time_seconds, and still reverses a clean move.
--
-- Executes the INSTALLED functions as the secretary (move_up_entry then
-- reverse_move_up_entry). Every fixture rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_2349_reverse_move_up_area5_element_guard_test.sql
--
-- Covers:
--   1. a destination with only area5_time_seconds set is refused, pair untouched;
--   2. a destination with only element_time_seconds set is refused, pair untouched;
--   3. a destination with neither set is still reversed (the guard is not over-broad).

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000002349001', 'MYK9-2349 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
  entry_close_date)
values ('00000000-0000-0000-0000-000002349002', 'MYK9-2349 Show', 'AKC',
  current_date + 7, current_date + 7, '00000000-0000-0000-0000-000002349001', 'published',
  now() + interval '3 days');

insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000002349004', '00000000-0000-0000-0000-000002349002',
  'MYK9-2349 Trial', current_date + 7, 'AKC');

insert into public.classes (id, trial_id, name, status, max_entries)
values
  ('00000000-0000-0000-0000-000002349011', '00000000-0000-0000-0000-000002349004', 'Container Novice A', 'upcoming', null),
  ('00000000-0000-0000-0000-000002349012', '00000000-0000-0000-0000-000002349004', 'Container Advanced A', 'upcoming', 10);

insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000002349101', 'MYK9-2349', 'Exhibitor', '00000000-0000-0000-0000-000002349201'),
  ('00000000-0000-0000-0000-000002349105', 'MYK9-2349', 'Secretary', '00000000-0000-0000-0000-000002349205');

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000002349105', id,
  '00000000-0000-0000-0000-000002349001', true,
  '00000000-0000-0000-0000-000002349205'
from public.roles where name = 'secretary';

insert into public.dogs (id, name, call_name, breed, owner_id)
select ('00000000-0000-0000-0000-0000023493' || n)::uuid, 'MYK9-2349 Dog ' || n, 'Dog' || n, 'Beagle',
  '00000000-0000-0000-0000-000002349101'::uuid
from generate_series(21, 23) n;

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select ('00000000-0000-0000-0000-0000023493' || n)::uuid, 'AKC (American Kennel Club)', 'SR2349' || n, true
from generate_series(21, 23) n;

-- One accepted, paid entry per case (31..33), all in class 11.
set local role service_role;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status, is_scored)
select ('00000000-0000-0000-0000-0000023490' || (n + 10))::uuid,
  ('00000000-0000-0000-0000-0000023493' || n)::uuid,
  '00000000-0000-0000-0000-000002349011', '00000000-0000-0000-0000-000002349002',
  '00000000-0000-0000-0000-000002349004', '00000000-0000-0000-0000-000002349101',
  'confirmed', 'paid', 35, 'no-status', false
from generate_series(21, 23) n;
reset role;

create function pg_temp.act_as(auth_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', auth_uid, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', auth_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.secretary_moves(entry_id uuid, target uuid, dest uuid) returns void
language plpgsql as $$
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000002349205');
  perform public.move_up_entry(entry_id, target, dest);
  reset role;
end;
$$;

create function pg_temp.secretary_undoes(dest uuid) returns void language plpgsql as $$
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000002349205');
  perform public.reverse_move_up_entry(dest);
  reset role;
end;
$$;

-- 1 and 2. A recorded area 5 or element time (and nothing else) refuses the undo.
do $$
declare
  v_case record;
  v_refused boolean;
  v_source_status text;
  v_dest_deleted timestamptz;
begin
  for v_case in
    select * from (values
      (1, 'area5_time_seconds', '00000000-0000-0000-0000-000002349031'::uuid,
          '00000000-0000-0000-0000-000002349051'::uuid),
      (2, 'element_time_seconds', '00000000-0000-0000-0000-000002349032'::uuid,
          '00000000-0000-0000-0000-000002349052'::uuid)
    ) as t(n, col, source_id, dest_id)
  loop
    perform pg_temp.secretary_moves(v_case.source_id,
      '00000000-0000-0000-0000-000002349012', v_case.dest_id);
    execute format('update public.entries set %I = 12.5 where id = $1', v_case.col)
      using v_case.dest_id;

    v_refused := false;
    begin
      perform pg_temp.secretary_undoes(v_case.dest_id);
    exception when sqlstate '22023' then
      if sqlerrm <> 'This run has already started, so the move-up can no longer be reversed.' then
        raise;
      end if;
      v_refused := true;
    end;
    reset role;

    if not v_refused then
      raise exception 'FAIL %: undo went through with % recorded', v_case.n, v_case.col;
    end if;
    select entry_status into v_source_status from public.entries where id = v_case.source_id;
    select deleted_at into v_dest_deleted from public.entries where id = v_case.dest_id;
    if v_source_status <> 'moved' or v_dest_deleted is not null then
      raise exception 'FAIL %: a refused undo changed the pair (source %, dest deleted %)',
        v_case.n, v_source_status, v_dest_deleted;
    end if;
    raise notice 'PASS %: undo refused with % recorded', v_case.n, v_case.col;
  end loop;
end;
$$;

-- 3. Neither time recorded: the undo still goes through.
do $$
declare
  v_source_status text;
  v_dest_deleted timestamptz;
begin
  perform pg_temp.secretary_moves('00000000-0000-0000-0000-000002349033',
    '00000000-0000-0000-0000-000002349012', '00000000-0000-0000-0000-000002349053');
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002349053');
  select entry_status into v_source_status from public.entries
   where id = '00000000-0000-0000-0000-000002349033';
  select deleted_at into v_dest_deleted from public.entries
   where id = '00000000-0000-0000-0000-000002349053';
  if v_source_status <> 'confirmed' or v_dest_deleted is null then
    raise exception 'FAIL 3: a clean move was not reversed (source %, dest deleted %)',
      v_source_status, v_dest_deleted;
  end if;
  raise notice 'PASS 3: a move with no area 5 or element time still reverses';
end;
$$;

rollback;
