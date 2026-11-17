-- MYK9-2122: Undo after Accept returns a class change request to waiting.
--
-- Behavioral test for public.reverse_move_up_entry as redefined in
-- 20261117163700_myk9_2122_undo_class_change_keeps_request.sql, which reads the
-- source's status before the move from public.entry_status_history. Executes the
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
--   5. the run-started guard (ring_entry_time set) still refuses the undo;
--   6. an entry accepted in place over a waiting request (Accept entry, which
--      leaves the request columns behind) is moved and undone: it stays
--      'confirmed', because nothing was waiting when THAT move began;
--   7. consecutive moves: undoing a move whose destination itself holds a waiting
--      class change request is refused in words, so the request is never moved
--      onto an entry without its class; once the request is taken back the undo
--      goes through;
--   8. a move made before this migration (built by hand with triggers off, its
--      history row inserted as the capture trigger wrote it) still undoes to
--      waiting: the history covers old moves too;
--   9. history that says the source was 'confirmed' when the latest move began
--      restores 'confirmed' even with leftover request columns and an OLDER
--      move that started from a waiting request (latest row wins).

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
from generate_series(21, 29) n;

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select ('00000000-0000-0000-0000-0000021223' || n)::uuid, 'AKC (American Kennel Club)', 'SR2122' || n, true
from generate_series(21, 29) n;

-- One accepted, paid entry per case (31..39), dog 21..29, all in class 11.
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
from generate_series(21, 29) n;
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

-- 6. Accepted in place over a waiting request, then moved and undone: confirmed.
do $$
declare
  v_after public.entries%rowtype;
begin
  perform pg_temp.exhibitor_asks('00000000-0000-0000-0000-000002122036',
    '00000000-0000-0000-0000-000002122012');
  -- Accept entry on the waiting row: the status goes to confirmed and the request
  -- flag and columns stay behind (the same shape an undo made before MYK9-2122
  -- left).
  update public.entries set entry_status = 'confirmed'
   where id = '00000000-0000-0000-0000-000002122036';

  perform pg_temp.secretary_moves('00000000-0000-0000-0000-000002122036',
    '00000000-0000-0000-0000-000002122013', '00000000-0000-0000-0000-000002122056');
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122056');

  select * into v_after from public.entries where id = '00000000-0000-0000-0000-000002122036';
  if v_after.entry_status is distinct from 'confirmed' then
    raise exception 'FAIL 6: an entry accepted in place came back as % after an ordinary move',
      v_after.entry_status;
  end if;
  raise notice 'PASS 6: leftovers of a request accepted in place do not revive it';
end;
$$;

-- 7. Consecutive moves: A -> B by the secretary, then the exhibitor asks for C on
-- B, the secretary accepts B -> C and undoes it (B waits again), then tries to
-- undo A -> B. That would carry B's waiting status onto A and delete the row that
-- holds the class asked for, so it is refused until the request is answered.
do $$
declare
  v_a public.entries%rowtype;
  v_b public.entries%rowtype;
  v_refused boolean := false;
begin
  perform pg_temp.secretary_moves('00000000-0000-0000-0000-000002122037',
    '00000000-0000-0000-0000-000002122012', '00000000-0000-0000-0000-000002122057');
  perform pg_temp.exhibitor_asks('00000000-0000-0000-0000-000002122057',
    '00000000-0000-0000-0000-000002122013');
  perform pg_temp.secretary_moves('00000000-0000-0000-0000-000002122057',
    '00000000-0000-0000-0000-000002122013', '00000000-0000-0000-0000-000002122058');
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122058');

  select * into v_b from public.entries where id = '00000000-0000-0000-0000-000002122057';
  if v_b.entry_status is distinct from 'move-up-requested' then
    raise exception 'FAIL 7 setup: B is % after the first undo', v_b.entry_status;
  end if;

  begin
    perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122057');
  exception when sqlstate '22023' then
    if sqlerrm <> 'This entry has a class change request waiting. Accept or decline it first.' then
      raise;
    end if;
    v_refused := true;
  end;
  reset role;

  if not v_refused then
    select * into v_a from public.entries where id = '00000000-0000-0000-0000-000002122037';
    raise exception 'FAIL 7: undo under a waiting request went through (A is %, target %)',
      v_a.entry_status, v_a.class_change_target_class_id;
  end if;
  select * into v_a from public.entries where id = '00000000-0000-0000-0000-000002122037';
  select * into v_b from public.entries where id = '00000000-0000-0000-0000-000002122057';
  if v_a.entry_status <> 'moved' or v_b.deleted_at is not null
     or v_b.entry_status <> 'move-up-requested'
     or v_b.class_change_target_class_id is distinct from '00000000-0000-0000-0000-000002122013' then
    raise exception 'FAIL 7: the refused undo changed the pair or the request';
  end if;

  -- Once the exhibitor takes the request back, the undo goes through.
  perform pg_temp.act_as('00000000-0000-0000-0000-000002122201');
  perform public.cancel_own_entry_class_change('00000000-0000-0000-0000-000002122057');
  reset role;
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122057');
  select * into v_a from public.entries where id = '00000000-0000-0000-0000-000002122037';
  if v_a.entry_status is distinct from 'confirmed' then
    raise exception 'FAIL 7: undo after the take-back restored %', v_a.entry_status;
  end if;
  raise notice 'PASS 7: undo is refused while the destination holds a waiting request';
end;
$$;

-- Build a moved pair by hand as a pre-migration move_up_entry left it, with
-- every trigger off, then write the capture trigger's history row ourselves.
create function pg_temp.legacy_move(source uuid, target uuid, dest uuid,
  before_status text, moved_at timestamptz) returns void
language plpgsql as $$
begin
  set local session_replication_role = replica;
  insert into public.entries (id, dog_id, show_id, class_id, trial_id, handler_id,
    entry_status, check_in_status, payment_status, entry_fee, moved_from_entry_id)
  select dest, e.dog_id, e.show_id, target, e.trial_id, e.handler_id,
    'confirmed', 'no-status', 'pending', 0, e.id
    from public.entries e where e.id = source;
  update public.entries set entry_status = 'moved' where id = source;
  set local session_replication_role = origin;
  insert into public.entry_status_history (entry_id, previous_status, new_status, changed_at)
  values (source, before_status, 'moved', moved_at);
end;
$$;

-- 8. A request accepted before this migration: Undo still returns it to waiting.
do $$
declare
  v_after public.entries%rowtype;
begin
  perform pg_temp.exhibitor_asks('00000000-0000-0000-0000-000002122038',
    '00000000-0000-0000-0000-000002122012');
  perform pg_temp.legacy_move('00000000-0000-0000-0000-000002122038',
    '00000000-0000-0000-0000-000002122012', '00000000-0000-0000-0000-000002122059',
    'move-up-requested', now() - interval '2 days');
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122059');

  select * into v_after from public.entries where id = '00000000-0000-0000-0000-000002122038';
  if v_after.entry_status is distinct from 'move-up-requested'
     or v_after.class_change_target_class_id is distinct from '00000000-0000-0000-0000-000002122012' then
    raise exception 'FAIL 8: undo of a pre-migration Accept restored % (target %)',
      v_after.entry_status, v_after.class_change_target_class_id;
  end if;
  raise notice 'PASS 8: a request accepted before the migration goes back to waiting';
end;
$$;

-- 9. The latest move began from 'confirmed' (an earlier one began from a waiting
-- request, and the request columns were left behind): Undo restores 'confirmed'.
do $$
declare
  v_after public.entries%rowtype;
begin
  perform pg_temp.exhibitor_asks('00000000-0000-0000-0000-000002122039',
    '00000000-0000-0000-0000-000002122012');
  -- An older move from the waiting request, long since undone.
  insert into public.entry_status_history (entry_id, previous_status, new_status, changed_at)
  values ('00000000-0000-0000-0000-000002122039', 'move-up-requested', 'moved',
    now() - interval '5 days');
  -- Accepted in place: confirmed, with the request flag and columns left behind.
  set local session_replication_role = replica;
  update public.entries set entry_status = 'confirmed'
   where id = '00000000-0000-0000-0000-000002122039';
  set local session_replication_role = origin;
  perform pg_temp.legacy_move('00000000-0000-0000-0000-000002122039',
    '00000000-0000-0000-0000-000002122013', '00000000-0000-0000-0000-000002122060',
    'confirmed', now() - interval '1 day');
  perform pg_temp.secretary_undoes('00000000-0000-0000-0000-000002122060');

  select * into v_after from public.entries where id = '00000000-0000-0000-0000-000002122039';
  if v_after.entry_status is distinct from 'confirmed' then
    raise exception 'FAIL 9: history said confirmed, undo restored %', v_after.entry_status;
  end if;
  if v_after.class_change_target_class_id is null then
    raise exception 'FAIL 9 setup: the leftover request columns were not there';
  end if;
  raise notice 'PASS 9: the latest move''s history decides, not leftover request columns';
end;
$$;

rollback;
