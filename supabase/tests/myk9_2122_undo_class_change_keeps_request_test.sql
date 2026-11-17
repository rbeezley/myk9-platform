-- MYK9-2122: Undo after Accept returns a class change request to waiting.
--
-- Behavioral test for public.reverse_move_up_entry as redefined in
-- 20261117163700_myk9_2122_undo_class_change_keeps_request.sql. Executes the
-- INSTALLED functions as each caller tier (the exhibitor asks through
-- request_own_entry_class_change, the secretary accepts through move_up_entry
-- and undoes through reverse_move_up_entry). Every fixture rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_2122_undo_class_change_keeps_request_test.sql
--
-- Covers:
--   1. undo of an accepted request puts it back to waiting, with the class asked
--      for, the reason and the time intact, and the exhibitor can still take it
--      back; no money column of the source moves;
--   2. undo of an ordinary move-up (no request) restores 'confirmed', as before;
--   3. a declined request leaves its columns behind, and a later ordinary move of
--      that entry still undoes to 'confirmed' (the leftovers are not a request);
--   4. a move to a class other than the one asked for, made while the request was
--      waiting, also undoes to waiting (the request was never answered);
--   5. the run-started guard (ring_entry_time set) still refuses the undo.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000002122001', 'MYK9-2122 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
  entry_close_date)
values ('00000000-0000-0000-0000-000002122002', 'MYK9-2122 Show', 'AKC',
  current_date + 7, current_date + 7, '00000000-0000-0000-0000-000002122001', 'published',
  now() + interval '3 days');

insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000002122004', '00000000-0000-0000-0000-000002122002',
  'MYK9-2122 Trial', current_date + 7, 'AKC');

-- 11 where every dog starts, 12 the class asked for, 13 another open class.
insert into public.classes (id, trial_id, name, status, max_entries)
values
  ('00000000-0000-0000-0000-000002122011', '00000000-0000-0000-0000-000002122004', 'Container Novice A', 'upcoming', null),
  ('00000000-0000-0000-0000-000002122012', '00000000-0000-0000-0000-000002122004', 'Container Advanced A', 'upcoming', 10),
  ('00000000-0000-0000-0000-000002122013', '00000000-0000-0000-0000-000002122004', 'Container Excellent A', 'upcoming', 10);

-- Person 101 is the exhibitor (owns every dog), 105 the club secretary.
insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000002122101', 'MYK9-2122', 'Exhibitor', '00000000-0000-0000-0000-000002122201'),
  ('00000000-0000-0000-0000-000002122105', 'MYK9-2122', 'Secretary', '00000000-0000-0000-0000-000002122205');

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000002122105', id,
  '00000000-0000-0000-0000-000002122001', true,
  '00000000-0000-0000-0000-000002122205'
from public.roles where name = 'secretary';

insert into public.dogs (id, name, call_name, breed, owner_id)
select ('00000000-0000-0000-0000-0000021223' || n)::uuid, 'MYK9-2122 Dog ' || n, 'Dog' || n, 'Beagle',
  '00000000-0000-0000-0000-000002122101'::uuid
from generate_series(21, 25) n;

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select ('00000000-0000-0000-0000-0000021223' || n)::uuid, 'AKC (American Kennel Club)', 'SR2122' || n, true
from generate_series(21, 25) n;

-- One accepted, paid entry per case (31..35), dog 21..25, all in class 11.
-- Written as service_role, as the 1265 fixture does, so the payment-field
-- protection trigger reads it as a server write.
set local role service_role;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status, is_scored)
select ('00000000-0000-0000-0000-0000021220' || (n + 10))::uuid,
  ('00000000-0000-0000-0000-0000021223' || n)::uuid,
  '00000000-0000-0000-0000-000002122011', '00000000-0000-0000-0000-000002122002',
  '00000000-0000-0000-0000-000002122004', '00000000-0000-0000-0000-000002122101',
  'confirmed', 'paid', 35, 'no-status', false
from generate_series(21, 25) n;
reset role;

create function pg_temp.act_as(auth_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', auth_uid, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', auth_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.exhibitor_asks(entry_id uuid, target uuid) returns void
language plpgsql as $$
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000002122201');
  perform public.request_own_entry_class_change(entry_id, target, 'finished_level');
  reset role;
end;
$$;

create function pg_temp.secretary_moves(entry_id uuid, target uuid, dest uuid) returns void
language plpgsql as $$
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000002122205');
  perform public.move_up_entry(entry_id, target, dest);
  reset role;
end;
$$;

create function pg_temp.secretary_undoes(dest uuid) returns void language plpgsql as $$
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000002122205');
  perform public.reverse_move_up_entry(dest);
  reset role;
end;
$$;

-- 1. Accept, then Undo: the request is waiting again, exactly as it was asked.
do $$
declare
  v_before public.entries%rowtype;
  v_after public.entries%rowtype;
  v_dest_deleted timestamptz;
begin
  perform pg_temp.exhibitor_asks('00000000-0000-0000-0000-000002122031',
    '00000000-0000-0000-0000-000002122012');
  select * into v_before from public.entries where id = '00000000-0000-0000-0000-000002122031';
  if v_before.entry_status <> 'move-up-requested' then
    raise exception 'FAIL setup: the request did not land (%)', v_before.entry_status;
  end if;

  perform pg_temp.secretary_moves('00000000-0000-0000-0000-000002122031',
    '00000000-0000-0000-0000-000002122012', '00000000-0000-0000-0000-000002122051');
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122051');

  select * into v_after from public.entries where id = '00000000-0000-0000-0000-000002122031';
  if v_after.entry_status is distinct from 'move-up-requested' then
    raise exception 'FAIL 1: undo of an accepted request restored %, not move-up-requested',
      v_after.entry_status;
  end if;
  if v_after.move_up_requested is not true then
    raise exception 'FAIL 1: undo cleared move_up_requested';
  end if;
  if v_after.class_change_target_class_id is distinct from v_before.class_change_target_class_id
     or v_after.class_change_reason is distinct from v_before.class_change_reason
     or v_after.class_change_requested_at is distinct from v_before.class_change_requested_at then
    raise exception 'FAIL 1: undo changed the stored request (% / % / %)',
      v_after.class_change_target_class_id, v_after.class_change_reason,
      v_after.class_change_requested_at;
  end if;
  if v_after.class_id is distinct from v_before.class_id
     or v_after.payment_status is distinct from v_before.payment_status
     or v_after.entry_fee is distinct from v_before.entry_fee
     or v_after.check_in_status is distinct from v_before.check_in_status then
    raise exception 'FAIL 1: undo moved the class, money or check-in of the source';
  end if;
  select deleted_at into v_dest_deleted from public.entries
   where id = '00000000-0000-0000-0000-000002122051';
  if v_dest_deleted is null then
    raise exception 'FAIL 1: the destination is still live after undo';
  end if;

  -- Still a request the exhibitor can take back, and the secretary can accept again.
  perform pg_temp.act_as('00000000-0000-0000-0000-000002122201');
  perform public.cancel_own_entry_class_change('00000000-0000-0000-0000-000002122031');
  reset role;
  select * into v_after from public.entries where id = '00000000-0000-0000-0000-000002122031';
  if v_after.entry_status <> 'confirmed' or v_after.class_change_target_class_id is not null then
    raise exception 'FAIL 1: the restored request could not be taken back (%)', v_after.entry_status;
  end if;

  raise notice 'PASS 1: undo of an accepted class change returns the request to waiting';
end;
$$;

-- 2. An ordinary move-up undoes to 'confirmed', as it always has.
do $$
declare
  v_after public.entries%rowtype;
begin
  perform pg_temp.secretary_moves('00000000-0000-0000-0000-000002122032',
    '00000000-0000-0000-0000-000002122012', '00000000-0000-0000-0000-000002122052');
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122052');

  select * into v_after from public.entries where id = '00000000-0000-0000-0000-000002122032';
  if v_after.entry_status is distinct from 'confirmed' then
    raise exception 'FAIL 2: undo of an ordinary move-up restored %', v_after.entry_status;
  end if;
  if coalesce(v_after.move_up_requested, false) then
    raise exception 'FAIL 2: undo of an ordinary move-up set move_up_requested';
  end if;
  raise notice 'PASS 2: undo of an ordinary move-up is unchanged';
end;
$$;

-- 3. A declined request leaves its columns behind (the client decline clears
-- only the status and the flag); a later ordinary move of the entry still undoes
-- to 'confirmed'.
do $$
declare
  v_after public.entries%rowtype;
begin
  perform pg_temp.exhibitor_asks('00000000-0000-0000-0000-000002122033',
    '00000000-0000-0000-0000-000002122012');
  -- The decline exactly as denyMoveUpRequestReplicated writes it.
  update public.entries
     set entry_status = 'confirmed', move_up_requested = false,
         special_requests = 'Move-up request denied'
   where id = '00000000-0000-0000-0000-000002122033';

  perform pg_temp.secretary_moves('00000000-0000-0000-0000-000002122033',
    '00000000-0000-0000-0000-000002122012', '00000000-0000-0000-0000-000002122053');
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122053');

  select * into v_after from public.entries where id = '00000000-0000-0000-0000-000002122033';
  if v_after.entry_status is distinct from 'confirmed' then
    raise exception 'FAIL 3: a declined request came back as % after an ordinary move',
      v_after.entry_status;
  end if;
  raise notice 'PASS 3: a declined request''s leftovers do not revive it';
end;
$$;

-- 4. A move to a different class while the request was waiting also undoes to
-- waiting: the request was never answered.
do $$
declare
  v_after public.entries%rowtype;
begin
  perform pg_temp.exhibitor_asks('00000000-0000-0000-0000-000002122034',
    '00000000-0000-0000-0000-000002122012');
  perform pg_temp.secretary_moves('00000000-0000-0000-0000-000002122034',
    '00000000-0000-0000-0000-000002122013', '00000000-0000-0000-0000-000002122054');
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122054');

  select * into v_after from public.entries where id = '00000000-0000-0000-0000-000002122034';
  if v_after.entry_status is distinct from 'move-up-requested'
     or v_after.class_change_target_class_id is distinct from '00000000-0000-0000-0000-000002122012' then
    raise exception 'FAIL 4: undo of a move made over a waiting request restored % (target %)',
      v_after.entry_status, v_after.class_change_target_class_id;
  end if;
  raise notice 'PASS 4: undo of any move made over a waiting request returns it to waiting';
end;
$$;

-- 5. The run-started guard still refuses, and leaves both rows alone.
do $$
declare
  v_source_status text;
  v_dest_deleted timestamptz;
  v_refused boolean := false;
begin
  perform pg_temp.exhibitor_asks('00000000-0000-0000-0000-000002122035',
    '00000000-0000-0000-0000-000002122012');
  perform pg_temp.secretary_moves('00000000-0000-0000-0000-000002122035',
    '00000000-0000-0000-0000-000002122012', '00000000-0000-0000-0000-000002122055');
  update public.entries set ring_entry_time = now()
   where id = '00000000-0000-0000-0000-000002122055';

  begin
    perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122055');
  exception when sqlstate '22023' then
    if sqlerrm <> 'This run has already started, so the move-up can no longer be reversed.' then
      raise;
    end if;
    v_refused := true;
  end;
  reset role;

  if not v_refused then
    raise exception 'FAIL 5: undo went through after the dog entered the ring';
  end if;
  select entry_status into v_source_status from public.entries
   where id = '00000000-0000-0000-0000-000002122035';
  select deleted_at into v_dest_deleted from public.entries
   where id = '00000000-0000-0000-0000-000002122055';
  if v_source_status <> 'moved' or v_dest_deleted is not null then
    raise exception 'FAIL 5: a refused undo changed the pair (source %, dest deleted %)',
      v_source_status, v_dest_deleted;
  end if;
  raise notice 'PASS 5: the run-started guard still refuses the undo';
end;
$$;

rollback;
