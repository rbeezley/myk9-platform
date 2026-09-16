-- MYK9-561: behavioral authorization test for public.update_own_entry_jump_height,
-- added by 20260916194700_update_own_entry_jump_height_rpc.sql.
--
-- Executes the INSTALLED function (never a source-string contract) as each
-- caller tier. Run with psql -X -v ON_ERROR_STOP=1 against a migrated local
-- database; every fixture rolls back. A clean run prints PASS notices.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/update_own_entry_jump_height_test.sql
--
-- Three shows, because three of the guards are properties of the SHOW, not the
-- entry: show A is open, show B has closed entries, show C is soft-deleted.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000561001', 'MYK9-561 Club');

-- A: open (no close date). B: entries closed ten days ago. C: soft-deleted.
-- D: the close day ITSELF, which is the only value that separates the guard's
-- `>` from a `>=` — ten days out, `>`, `>=` and a timezone-dropped variant all
-- agree, so show B alone cannot pin the boundary.
--
-- Both close dates are written as EXPLICIT midnight UTC, the way the app stores
-- a close date typed as a calendar day, rather than `current_date::timestamptz`
-- (midnight in the SERVER's timezone, which lands on the previous UTC day for
-- any positive UTC offset and would make this fixture's verdict depend on where
-- it runs).
insert into public.shows (id, name, organization, start_date, end_date, club_id, status,
  entry_close_date, deleted_at)
values
  ('00000000-0000-0000-0000-000000561002', 'MYK9-561 Show A', 'AKC',
    current_date, current_date, '00000000-0000-0000-0000-000000561001', 'published', null, null),
  ('00000000-0000-0000-0000-000000561004', 'MYK9-561 Show B', 'AKC',
    current_date, current_date, '00000000-0000-0000-0000-000000561001', 'published',
    ((current_date - 10)::text || ' 00:00:00+00')::timestamptz, null),
  ('00000000-0000-0000-0000-000000561005', 'MYK9-561 Show C', 'AKC',
    current_date, current_date, '00000000-0000-0000-0000-000000561001', 'published', null, now()),
  ('00000000-0000-0000-0000-000000561008', 'MYK9-561 Show D', 'AKC',
    current_date, current_date, '00000000-0000-0000-0000-000000561001', 'published',
    (current_date::text || ' 00:00:00+00')::timestamptz, null);

insert into public.trials (id, show_id, name, date, registry_id)
values
  ('00000000-0000-0000-0000-000000561003', '00000000-0000-0000-0000-000000561002',
    'MYK9-561 Trial A', current_date, 'AKC'),
  ('00000000-0000-0000-0000-000000561006', '00000000-0000-0000-0000-000000561004',
    'MYK9-561 Trial B', current_date, 'AKC'),
  ('00000000-0000-0000-0000-000000561007', '00000000-0000-0000-0000-000000561005',
    'MYK9-561 Trial C', current_date, 'AKC'),
  ('00000000-0000-0000-0000-000000561009', '00000000-0000-0000-0000-000000561008',
    'MYK9-561 Trial D', current_date, 'AKC');

-- `entries_dog_class_unique_idx` is UNIQUE on (dog_id, class_id) WHERE
-- entry_status <> ALL ('withdrawn','scratched') and does NOT exclude
-- soft-deleted rows, so every scenario gets its own class on one dog. One dog
-- keeps a single dog_registrations row, which
-- trg_entries_require_dog_registration matches against the trial's registry.
insert into public.classes (id, trial_id, name, status)
select ('00000000-0000-0000-0000-00000056114' || n)::uuid,
  '00000000-0000-0000-0000-000000561003', 'Container Novice ' || n, 'upcoming'
from generate_series(1, 9) n;

insert into public.classes (id, trial_id, name, status)
values
  ('00000000-0000-0000-0000-000000561151', '00000000-0000-0000-0000-000000561006',
    'Interior Novice B', 'upcoming'),
  ('00000000-0000-0000-0000-000000561152', '00000000-0000-0000-0000-000000561007',
    'Interior Novice C', 'upcoming'),
  ('00000000-0000-0000-0000-000000561153', '00000000-0000-0000-0000-000000561009',
    'Interior Novice D', 'upcoming');

-- 1 owner, 2 co-owner, 3 handler, 4 outsider, 6 club secretary.
insert into public.people (id, first_name, last_name, auth_user_id)
select ('00000000-0000-0000-0000-00000056101' || n)::uuid, 'MYK9-561', 'Person ' || n,
  ('00000000-0000-0000-0000-00000056110' || n)::uuid
from generate_series(1, 4) n;

insert into public.people (id, first_name, last_name, auth_user_id)
values ('00000000-0000-0000-0000-000000561016', 'MYK9-561', 'Secretary',
  '00000000-0000-0000-0000-000000561106');

insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
values ('00000000-0000-0000-0000-000000561021', 'MYK9-561 Dog', 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000561011', '00000000-0000-0000-0000-000000561012');

insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000561021', 'AKC (American Kennel Club)', 'SR561021', true);

-- Nine targets in show A, entry 5613'n' in class 56114'n'. Each guard gets a row
-- of its own so a passing case can never mask a failing one. Every one starts at
-- jump_height '8"', so an unexpected write is always visible.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status, jump_height)
select ('00000000-0000-0000-0000-00000056113' || n)::uuid,
  '00000000-0000-0000-0000-000000561021',
  ('00000000-0000-0000-0000-00000056114' || n)::uuid,
  '00000000-0000-0000-0000-000000561002',
  '00000000-0000-0000-0000-000000561003', '00000000-0000-0000-0000-000000561013',
  'confirmed', 'pending', 25, 'no-status', '8"'
from generate_series(1, 9) n;

insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status, jump_height)
values
  ('00000000-0000-0000-0000-000000561162', '00000000-0000-0000-0000-000000561021',
    '00000000-0000-0000-0000-000000561151', '00000000-0000-0000-0000-000000561004',
    '00000000-0000-0000-0000-000000561006', '00000000-0000-0000-0000-000000561013',
    'confirmed', 'pending', 25, 'no-status', '8"'),
  ('00000000-0000-0000-0000-000000561163', '00000000-0000-0000-0000-000000561021',
    '00000000-0000-0000-0000-000000561152', '00000000-0000-0000-0000-000000561005',
    '00000000-0000-0000-0000-000000561007', '00000000-0000-0000-0000-000000561013',
    'confirmed', 'pending', 25, 'no-status', '8"'),
  ('00000000-0000-0000-0000-000000561164', '00000000-0000-0000-0000-000000561021',
    '00000000-0000-0000-0000-000000561153', '00000000-0000-0000-0000-000000561008',
    '00000000-0000-0000-0000-000000561009', '00000000-0000-0000-0000-000000561013',
    'confirmed', 'pending', 25, 'no-status', '8"');

-- 561132 paid: the deliberate difference from withdraw_own_entry — changing a
-- height moves no money, so a PAID entry stays editable by its owner.
update public.entries set payment_status = 'paid'
 where id = '00000000-0000-0000-0000-000000561132';
update public.entries set entry_status = 'withdrawn'
 where id = '00000000-0000-0000-0000-000000561133';
update public.entries set is_scored = true
 where id = '00000000-0000-0000-0000-000000561134';
update public.entries set deleted_at = now()
 where id = '00000000-0000-0000-0000-000000561135';
-- self_checkin_entry writes ONLY check_in_status, leaving entry_status
-- 'confirmed' — the day-of self-edit hole this guard closes.
update public.entries set check_in_status = 'checked-in'
 where id = '00000000-0000-0000-0000-000000561139';

-- Club-scoped appointment: since the label/permission split a show-scoped
-- user_roles row grants nothing, so the secretary is appointed at the club.
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000561016', id,
  '00000000-0000-0000-0000-000000561001', true,
  '00000000-0000-0000-0000-000000561106'
from public.roles where name = 'secretary';

-- Invoker helper. Fixtures and read-back run as the migration role; the RPC
-- itself always runs as authenticated/anon, so no test-only grants are needed.
create function pg_temp.assert_jump(
  label text,
  caller text,
  target_id uuid,
  expected_error text default null,
  p_jump_height text default '16"',
  expected_version integer default null,
  caller_role text default 'authenticated'
) returns void language plpgsql as $$
declare
  before_version integer;
  actual_error text;
  actual_state text;
  new_height text;
  new_version integer;
begin
  select e.version into before_version from public.entries e where e.id = target_id;

  perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', caller_role)::text, true);
  perform set_config('role', caller_role, true);
  begin
    perform public.update_own_entry_jump_height(target_id, p_jump_height, expected_version);
  exception when others then
    actual_error := sqlerrm;
    actual_state := sqlstate;
  end;
  reset role;

  if expected_error is null and actual_error is not null then
    raise exception 'FAIL %: unexpected SQLSTATE %: %', label, actual_state, actual_error;
  end if;

  if expected_error is not null then
    if actual_error is null or actual_error not like expected_error then
      raise exception 'FAIL %: expected %, got SQLSTATE %: %',
        label, expected_error, actual_state, actual_error;
    end if;
    -- DELIBERATELY NOT a before/after snapshot of the rows. The `begin …
    -- exception when others` above is an implicit SAVEPOINT, so anything the
    -- function wrote before raising is already rolled back by the time this
    -- line runs: such a compare can never fail, and would read as load-bearing
    -- coverage of "a denied call writes nothing" while asserting nothing at all
    -- (LESSONS `mutation-actually-mutated`). The refusal ITSELF is the
    -- assertion — and a call that wrote and did NOT raise lands in the branch
    -- above, which fails on the missing error.
    raise notice 'PASS %', label;
    return;
  end if;

  select e.jump_height, e.version into new_height, new_version
    from public.entries e where e.id = target_id;

  if new_height is distinct from btrim(p_jump_height) then
    raise exception 'FAIL %: jump_height is % after an allowed save', label, new_height;
  end if;
  if new_version is null or before_version is null or new_version <= before_version then
    raise exception 'FAIL %: version did not advance (% -> %)',
      label, before_version, new_version;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- RED before 20260916194700: every call below raises SQLSTATE 42883
-- (function public.update_own_entry_jump_height does not exist).

-- Allowed: the three owner-tier arms, each on its own row.
select pg_temp.assert_jump('dog owner', '00000000-0000-0000-0000-000000561101',
  '00000000-0000-0000-0000-000000561131');
select pg_temp.assert_jump('co-owner', '00000000-0000-0000-0000-000000561102',
  '00000000-0000-0000-0000-000000561137');
select pg_temp.assert_jump('listed handler', '00000000-0000-0000-0000-000000561103',
  '00000000-0000-0000-0000-000000561138');

-- The deliberate difference from withdraw_own_entry: a PAID entry's height may
-- still be corrected, because changing it moves no money.
select pg_temp.assert_jump('owner edits a PAID entry',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561132');

-- The value is trimmed, not stored with its whitespace.
select pg_temp.assert_jump('the height is trimmed',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561131',
  null, '  20"  ');

-- Denied: an unrelated authenticated caller, an authenticated caller with no
-- person row, and anon (which has no EXECUTE grant at all).
select pg_temp.assert_jump('outsider', '00000000-0000-0000-0000-000000561104',
  '00000000-0000-0000-0000-000000561136', 'Not authorized to update entry %');
select pg_temp.assert_jump('authenticated caller with no person row',
  '00000000-0000-0000-0000-000000561199',
  '00000000-0000-0000-0000-000000561136', 'Not authorized to update entry %');
select pg_temp.assert_jump('anonymous', null,
  '00000000-0000-0000-0000-000000561136',
  'permission denied for function update_own_entry_jump_height', '16"', null, 'anon');
select pg_temp.assert_jump('nonexistent entry', '00000000-0000-0000-0000-000000561101',
  '00000000-0000-0000-0000-000000561099', 'Entry % not found');

-- Owner-only guards. Each must leave every row of every show untouched.
select pg_temp.assert_jump('owner cannot edit a WITHDRAWN entry',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561133',
  'Entry % can no longer be edited from status %');
select pg_temp.assert_jump('owner cannot edit a SCORED entry',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561134',
  'Entry % has been scored and can no longer be edited');
select pg_temp.assert_jump('owner cannot edit a soft-deleted entry',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561135',
  'Entry % has been removed');
select pg_temp.assert_jump('owner cannot edit a CHECKED-IN entry',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561139',
  'Entry % is checked in at the show; ask the secretary to change it');
select pg_temp.assert_jump('owner cannot edit after entries CLOSE',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561162',
  'Entries have closed for this show; ask the secretary to change entry %');
-- The other half of that boundary, and the half that makes it a boundary: the
-- close DAY itself is still open. `>` passes; `>=` fails here and nowhere else.
select pg_temp.assert_jump('owner CAN edit on the close day itself',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561164');
select pg_temp.assert_jump('owner cannot edit an entry in a soft-deleted SHOW',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561163',
  'Entry % has been removed');

-- The value itself. A blank or whitespace-only height must never blank the
-- column, and an absurd one must not be stored.
select pg_temp.assert_jump('rejects a blank height',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561136',
  'update_own_entry_jump_height requires a jump height', '   ');
select pg_temp.assert_jump('rejects a NULL height',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561136',
  'update_own_entry_jump_height requires a jump height', null);
select pg_temp.assert_jump('rejects an over-long height',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561136',
  'Jump height is too long', repeat('x', 33));

-- OCC: a stale expected version conflicts and writes nothing.
select pg_temp.assert_jump('stale expected version conflicts',
  '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561136',
  'Version conflict updating entry % (expected %)', '16"', 9999);

-- ...and the matching version succeeds, so the conflict above is about the
-- version and not about the precondition existing at all.
do $$
declare
  v_version integer;
begin
  select e.version into v_version
    from public.entries e where e.id = '00000000-0000-0000-0000-000000561136';
  perform pg_temp.assert_jump('matching expected version succeeds',
    '00000000-0000-0000-0000-000000561101', '00000000-0000-0000-0000-000000561136',
    null, '24"', v_version);
end;
$$;

-- Manager parity: the club secretary keeps the reach `entries_update` already
-- gives them — including on a withdrawn entry and after entries close, both of
-- which the owner tier refuses.
select pg_temp.assert_jump('club secretary edits a withdrawn entry',
  '00000000-0000-0000-0000-000000561106', '00000000-0000-0000-0000-000000561133');
select pg_temp.assert_jump('club secretary edits after entries close',
  '00000000-0000-0000-0000-000000561106', '00000000-0000-0000-0000-000000561162');

-- The column allow-list is the SIGNATURE: there is no overload that takes a
-- fields bag, so no caller can widen it.
do $$
declare
  v_overloads integer;
begin
  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_own_entry_jump_height';
  if v_overloads <> 1 then
    raise exception 'FAIL allow-list: % overloads of update_own_entry_jump_height exist',
      v_overloads;
  end if;
  raise notice 'PASS the column allow-list is the signature (one overload)';
end;
$$;

-- Negative control for the ORIGINAL bug: the exhibitor's DIRECT UPDATE is still
-- denied by `entries_update`. If this ever starts succeeding, the RPC has been
-- made redundant by a policy change and this whole seam needs revisiting.
do $$
declare
  v_after text;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000561101', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000561101', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    update public.entries set jump_height = '26"'
     where id = '00000000-0000-0000-0000-000000561139';
  exception when others then
    null;  -- a hard denial is just as good as a zero-row match
  end;
  reset role;

  -- 561139 is the checked-in row: every RPC call against it was refused, so it
  -- is still '8"' and a successful direct UPDATE would be unambiguous.
  select e.jump_height into v_after
    from public.entries e where e.id = '00000000-0000-0000-0000-000000561139';
  if v_after = '26"' then
    raise exception
      'FAIL direct-update control: entries_update now admits an exhibitor; the RPC seam needs review';
  end if;
  raise notice 'PASS a direct exhibitor UPDATE on entries is still denied';
end;
$$;

rollback;
