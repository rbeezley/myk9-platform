-- MYK9-719: behavioral test for 20260924094300_myk9_719_retire_scratch_requested.sql.
--
-- Exercises the INSTALLED `entries_entry_status_check` on a real row: both
-- scratch-request spellings are refused with SQLSTATE 23514 on INSERT and on
-- UPDATE, while the move-up request (both spellings) and 'scratched' still pass
-- on the same row — so a refusal can never be the fixture failing for some other
-- reason. Run with psql -X -v ON_ERROR_STOP=1 after migrations; every fixture
-- rolls back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_719_scratch_requested_retired_test.sql

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000719001', 'MYK9-719 Club');

insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000719002', 'MYK9-719 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000719001', 'published');

insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000719003', '00000000-0000-0000-0000-000000719002',
  'MYK9-719 Trial', current_date, 'AKC');

-- One class per INSERT attempt: `entries_dog_class_unique_idx` allows one live
-- entry per (dog, class), and every accepted INSERT below leaves its row.
insert into public.classes (id, trial_id, name, status)
select ('00000000-0000-0000-0000-00000071904' || n)::uuid,
  '00000000-0000-0000-0000-000000719003', 'Container Novice ' || n, 'upcoming'
from generate_series(1, 4) n;

insert into public.people (id, first_name, last_name)
values ('00000000-0000-0000-0000-000000719011', 'MYK9-719', 'Owner');

insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000000719021', 'MYK9-719 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000719011');

-- trg_entries_require_dog_registration needs a registration for the trial's registry.
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000719021', 'AKC (American Kennel Club)', 'SR719021', true);

create function pg_temp.insert_entry(p_class_suffix int, p_status text)
returns void
language sql
as $$
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
    entry_status, payment_status, entry_fee, check_in_status)
  values (('00000000-0000-0000-0000-00000071905' || p_class_suffix)::uuid,
    '00000000-0000-0000-0000-000000719021',
    ('00000000-0000-0000-0000-00000071904' || p_class_suffix)::uuid,
    '00000000-0000-0000-0000-000000719002', '00000000-0000-0000-0000-000000719003',
    '00000000-0000-0000-0000-000000719011', p_status, 'pending', 25, 'no-status');
$$;

-- ---------------------------------------------------------------------------
-- The installed constraint no longer names either spelling.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.entries'::regclass
     and conname = 'entries_entry_status_check';

  if v_def is null then
    raise exception 'FAIL wiring: entries_entry_status_check is missing';
  end if;
  if v_def ilike '%scratch-requested%' or v_def ilike '%scratch_requested%' then
    raise exception 'FAIL: entries_entry_status_check still admits a scratch request: %', v_def;
  end if;
  if v_def not ilike '%''move-up-requested''%' or v_def not ilike '%''move_up_requested''%' then
    raise exception 'FAIL: entries_entry_status_check lost a move-up spelling: %', v_def;
  end if;
  raise notice 'PASS wiring: entries_entry_status_check names no scratch request, keeps both move-up spellings';
end;
$$;

-- ---------------------------------------------------------------------------
-- INSERT: refused for both retired spellings, accepted for the positive controls.
-- ---------------------------------------------------------------------------
do $$
declare
  v_status text;
  v_state text;
begin
  foreach v_status in array array['scratch-requested', 'scratch_requested'] loop
    v_state := null;
    begin
      perform pg_temp.insert_entry(1, v_status);
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '23514' then
      raise exception 'FAIL insert %: expected check_violation 23514, got %',
        v_status, coalesce(v_state, 'success');
    end if;
    raise notice 'PASS insert %: refused with 23514', v_status;
  end loop;
end;
$$;

-- Positive controls on the same fixture: without these, a refusal above could be
-- a broken fixture (FK, trigger) rather than the CHECK.
select pg_temp.insert_entry(2, 'move-up-requested');
select pg_temp.insert_entry(3, 'move_up_requested');
select pg_temp.insert_entry(4, 'confirmed');

do $$
begin
  if (select count(*) from public.entries
       where dog_id = '00000000-0000-0000-0000-000000719021') <> 3 then
    raise exception 'FAIL positive control: expected exactly the three accepted rows';
  end if;
  raise notice 'PASS positive control: move-up (both spellings) and confirmed are accepted';
end;
$$;

-- ---------------------------------------------------------------------------
-- UPDATE: an existing row cannot be moved INTO either retired value, and can
-- still be moved to 'scratched' (the pull itself).
-- ---------------------------------------------------------------------------
do $$
declare
  v_status text;
  v_state text;
  v_entry uuid;
begin
  v_entry := '00000000-0000-0000-0000-000000719054';

  foreach v_status in array array['scratch-requested', 'scratch_requested'] loop
    v_state := null;
    begin
      update public.entries set entry_status = v_status where id = v_entry;
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '23514' then
      raise exception 'FAIL update to %: expected check_violation 23514, got %',
        v_status, coalesce(v_state, 'success');
    end if;
    raise notice 'PASS update to %: refused with 23514', v_status;
  end loop;

  update public.entries set entry_status = 'scratched' where id = v_entry;
  if (select entry_status from public.entries where id = v_entry) <> 'scratched' then
    raise exception 'FAIL positive control: the row could not be pulled to scratched';
  end if;
  raise notice 'PASS positive control: the same row still pulls to scratched';
end;
$$;

rollback;
