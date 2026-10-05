-- MYK9-995: behavioral test for public.get_my_entry_queue_places, added by
-- 20261005014900_myk9_995_my_entry_queue_places.sql.
--
-- Executes the INSTALLED function as each caller tier. Run with
-- psql -X -v ON_ERROR_STOP=1 against a migrated local database; every fixture
-- rolls back. A clean run prints PASS notices.
--
-- PARITY: the $fixture$ block below is the ONE fixture both queues are judged
-- on. This file loads it into `entries` and asserts the RPC's places equal
-- each row's `expected`; serverQueuePlaceParity.test.ts (apps/myk9show,
-- features/at-show) parses the same block and asserts the ringside TypeScript
-- queue (rowToEntry -> toRunQueueEntry -> pendingByRunOrder) yields the same
-- `expected`. Change a waiting rule on either side and that side goes red.
--
-- Row fields mirror `entries` columns. `deleted` stands for deleted_at. The
-- fixture lists rows in the order the TypeScript side receives them; this file
-- inserts them in REVERSE so SQL's tie-break (run order, then armband) cannot
-- lean on insertion order. The tied a24/a25 pair is listed with the HIGHER
-- armband first, so the TypeScript side passes only through its own tie-break
-- (compareByRunOrder), never through input order. `expected` is the place the caller sees: null when
-- the row is not waiting, or its own run_order is unset (NULL or 0).

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000995001', 'MYK9-995 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000995002', 'MYK9-995 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000995001', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000995003', '00000000-0000-0000-0000-000000995002',
  'MYK9-995 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values
  ('00000000-0000-0000-0000-0000009950a0', '00000000-0000-0000-0000-000000995003',
    'MYK9-995 Class A', 'upcoming'),
  ('00000000-0000-0000-0000-0000009950b0', '00000000-0000-0000-0000-000000995003',
    'MYK9-995 Class B', 'upcoming');

-- People: 1 owner (owns every fixture dog), 2 handler (handles one stranger's
-- entry in class B), 3 that stranger (owns that dog), 4 an unrelated exhibitor.
-- auth_user_id is deliberately NOT people.id.
insert into public.people (id, first_name, last_name, auth_user_id)
select ('00000000-0000-0000-0000-00000099501' || n)::uuid, 'MYK9-995', 'Person ' || n,
  ('00000000-0000-0000-0000-00000099510' || n)::uuid
from generate_series(1, 4) n;

-- `check_in_given` separates a row that omits check_in_status (the column
-- default) from one that sets it to JSON null (a NULL column).
create temp table fixture as
select ord, r.*, f.row ? 'check_in_status' as check_in_given
from jsonb_array_elements($fixture$
[
  {"key": "a19", "class": "A", "armband": "2",    "run_order": null, "expected": null},
  {"key": "a1",  "class": "A", "armband": "101",  "run_order": 5,    "expected": 4},
  {"key": "a2",  "class": "A", "armband": "102",  "run_order": 3,    "check_in_status": "checked-in", "expected": 2},
  {"key": "a3",  "class": "A", "armband": "103",  "run_order": 1,    "check_in_status": "in-ring", "expected": null},
  {"key": "a4",  "class": "A", "armband": "104",  "run_order": 2,    "is_scored": true, "expected": null},
  {"key": "a5",  "class": "A", "armband": "105",  "run_order": 4,    "check_in_status": "pulled", "expected": null},
  {"key": "a6",  "class": "A", "armband": "106",  "run_order": 6,    "check_in_status": "at-gate", "expected": 5},
  {"key": "a7",  "class": "A", "armband": "107",  "run_order": 7,    "check_in_status": "come-to-gate", "expected": 6},
  {"key": "a8",  "class": "A", "armband": "108",  "run_order": 8,    "check_in_status": "conflict", "expected": 7},
  {"key": "a9",  "class": "A", "armband": "109",  "run_order": 9,    "check_in_status": "completed", "expected": null},
  {"key": "a10", "class": "A", "armband": "110",  "run_order": 10,   "entry_status": "withdrawn", "expected": null},
  {"key": "a11", "class": "A", "armband": "111",  "run_order": 1,    "entry_status": "scratched", "expected": null},
  {"key": "a12", "class": "A", "armband": "112",  "run_order": 1,    "entry_status": "absent", "expected": null},
  {"key": "a13", "class": "A", "armband": "113",  "run_order": 1,    "entry_status": "moved", "expected": null},
  {"key": "a14", "class": "A", "armband": "114",  "run_order": 1,    "entry_status": "not_accepted", "expected": null},
  {"key": "a15", "class": "A", "armband": "115",  "run_order": 1,    "result_status": "absent", "expected": null},
  {"key": "a16", "class": "A", "armband": "116",  "run_order": 1,    "result_status": "excused", "expected": null},
  {"key": "a17", "class": "A", "armband": "117",  "run_order": 1,    "deleted": true, "expected": null},
  {"key": "a18", "class": "A", "armband": "118",  "run_order": 1,    "is_in_ring": true, "expected": null},
  {"key": "a20", "class": "A", "armband": " 4x",  "run_order": 0,    "expected": null},
  {"key": "a21", "class": "A", "armband": "121",  "run_order": 11,   "entry_status": "completed", "expected": 8},
  {"key": "a22", "class": "A", "armband": "122",  "run_order": 12,   "entry_status": "draft", "expected": 9},
  {"key": "a24", "class": "A", "armband": "205",  "run_order": 13,   "expected": 11},
  {"key": "a25", "class": "A", "armband": "201",  "run_order": 13,   "expected": 10},
  {"key": "a26", "class": "A", "armband": "126",  "run_order": 14,   "check_in_status": null, "expected": 12},
  {"key": "a23", "class": "A", "armband": "123",  "run_order": 15,   "result_status": "qualified", "expected": 13},
  {"key": "b2",  "class": "B", "armband": "302",  "run_order": 2,    "expected": 1}
]
$fixture$::jsonb) with ordinality as f(row, ord)
cross join lateral jsonb_to_record(f.row) as r(
  key text, class text, armband text, run_order integer, is_scored boolean,
  is_in_ring boolean, check_in_status text, entry_status text, result_status text,
  deleted boolean, expected integer
);

create function pg_temp.fx_id(k text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' ||
    lpad(to_hex(('x' || substr(md5(k), 1, 8))::bit(32)::bigint), 12, '0'))::uuid
$$;

-- One dog per row (entries_dog_class_unique_idx), all owned by person 1.
insert into public.dogs (id, name, call_name, breed, owner_id)
select pg_temp.fx_id('dog-' || key), 'MYK9-995 ' || key, key, 'Beagle',
  '00000000-0000-0000-0000-000000995011'
from fixture;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select pg_temp.fx_id('dog-' || key), 'AKC (American Kennel Club)', 'SR995' || key, true
from fixture;

insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, armband, run_order, is_scored, is_in_ring,
  check_in_status, result_status, deleted_at)
select pg_temp.fx_id(key), pg_temp.fx_id('dog-' || key),
  case class when 'A' then '00000000-0000-0000-0000-0000009950a0'::uuid
             else '00000000-0000-0000-0000-0000009950b0'::uuid end,
  '00000000-0000-0000-0000-000000995002', '00000000-0000-0000-0000-000000995003', null,
  coalesce(entry_status, 'confirmed'), 'pending', 25, armband, run_order,
  coalesce(is_scored, false), coalesce(is_in_ring, false),
  case when check_in_given then check_in_status else 'no-status' end,
  coalesce(result_status, 'pending'),
  case when deleted then now() end
from fixture
order by ord desc;

-- Class B also holds a STRANGER's dog, handled by person 2 and owned by
-- person 3, running first. Person 1's b2 is therefore 1st up only because the
-- stranger's b1 is in the ring.
insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-0000009950d1', 'MYK9-995 Stranger', 'Stranger', 'Beagle',
  '00000000-0000-0000-0000-000000995013'),
  ('00000000-0000-0000-0000-0000009950d2', 'MYK9-995 Stranger Two', 'Two', 'Beagle',
  '00000000-0000-0000-0000-000000995013');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-0000009950d1', 'AKC (American Kennel Club)', 'SR995D1', true),
  ('00000000-0000-0000-0000-0000009950d2', 'AKC (American Kennel Club)', 'SR995D2', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, armband, run_order, check_in_status)
values
  ('00000000-0000-0000-0000-0000009950e1', '00000000-0000-0000-0000-0000009950d1',
    '00000000-0000-0000-0000-0000009950b0', '00000000-0000-0000-0000-000000995002',
    '00000000-0000-0000-0000-000000995003', '00000000-0000-0000-0000-000000995012',
    'confirmed', 'pending', 25, '301', 1, 'in-ring'),
  ('00000000-0000-0000-0000-0000009950e2', '00000000-0000-0000-0000-0000009950d2',
    '00000000-0000-0000-0000-0000009950b0', '00000000-0000-0000-0000-000000995002',
    '00000000-0000-0000-0000-000000995003', '00000000-0000-0000-0000-000000995012',
    'confirmed', 'pending', 25, '303', 3, 'checked-in');

-- Run the RPC as a given caller; return its rows as {entry_id: place} jsonb.
create function pg_temp.places_as(caller text, ids uuid[], caller_role text default 'authenticated')
returns jsonb language plpgsql as $$
declare
  result jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(caller, ''), true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', caller_role)::text, true);
  perform set_config('role', caller_role, true);
  select coalesce(jsonb_object_agg(p.entry_id::text, p.place), '{}'::jsonb)
    into result
    from public.get_my_entry_queue_places(ids) p;
  reset role;
  return result;
exception when others then
  reset role;
  raise;
end;
$$;

-- 1. Parity: the owner sees exactly `expected` for every fixture row.
do $$
declare
  got jsonb;
  bad text;
begin
  got := pg_temp.places_as('00000000-0000-0000-0000-000000995101',
    (select array_agg(pg_temp.fx_id(key)) from fixture));

  select string_agg(format('%s: expected %s, got %s', key,
      coalesce(expected::text, 'null'),
      coalesce(got ->> pg_temp.fx_id(key)::text, 'null')), '; ')
    into bad
    from fixture
   where (got ->> pg_temp.fx_id(key)::text)::integer is distinct from expected;
  if bad is not null then
    raise exception 'FAIL parity: %', bad;
  end if;

  -- The soft-deleted own row is not the caller's live entry: no row at all.
  if got ? pg_temp.fx_id('a17')::text then
    raise exception 'FAIL parity: a soft-deleted entry returned a row';
  end if;
  if (select count(*) from jsonb_object_keys(got)) <> (select count(*) - 1 from fixture) then
    raise exception 'FAIL parity: expected one row per live own entry, got %', got;
  end if;
  raise notice 'PASS parity: owner places match the shared fixture';
end;
$$;

-- 2. Tie on run order breaks by armband, never by id or insertion order. The
-- fixture's a24/a25 pair has hashed ids, so it cannot prove "not by id" alone:
-- class C holds a pair whose LOWER id carries the HIGHER armband.
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-0000009950c0', '00000000-0000-0000-0000-000000995003',
  'MYK9-995 Class C', 'upcoming');
insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-0000009950f1', 'MYK9-995 Tie One', 'TieOne', 'Beagle',
  '00000000-0000-0000-0000-000000995011'),
  ('00000000-0000-0000-0000-0000009950f2', 'MYK9-995 Tie Two', 'TieTwo', 'Beagle',
  '00000000-0000-0000-0000-000000995011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-0000009950f1', 'AKC (American Kennel Club)', 'SR995F1', true),
  ('00000000-0000-0000-0000-0000009950f2', 'AKC (American Kennel Club)', 'SR995F2', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status,
  payment_status, entry_fee, armband, run_order)
values
  ('00000000-0000-0000-0000-0000009950c2', '00000000-0000-0000-0000-0000009950f2',
    '00000000-0000-0000-0000-0000009950c0', '00000000-0000-0000-0000-000000995002',
    '00000000-0000-0000-0000-000000995003', 'confirmed', 'pending', 25, '3', 4),
  ('00000000-0000-0000-0000-0000009950c1', '00000000-0000-0000-0000-0000009950f1',
    '00000000-0000-0000-0000-0000009950c0', '00000000-0000-0000-0000-000000995002',
    '00000000-0000-0000-0000-000000995003', 'confirmed', 'pending', 25, '9', 4);

do $$
declare
  got jsonb := pg_temp.places_as('00000000-0000-0000-0000-000000995101',
    array['00000000-0000-0000-0000-0000009950c1', '00000000-0000-0000-0000-0000009950c2']::uuid[]);
begin
  if got <> jsonb_build_object(
       '00000000-0000-0000-0000-0000009950c2', 1,
       '00000000-0000-0000-0000-0000009950c1', 2) then
    raise exception 'FAIL tie-break: armband 3 must run before armband 9, got %', got;
  end if;
  raise notice 'PASS tie-break by armband';
end;
$$;

-- 3. The handler of a stranger's dog sees that entry's place; so does its
-- owner. The in-ring b1 is in neither queue position.
do $$
declare
  handler_got jsonb := pg_temp.places_as('00000000-0000-0000-0000-000000995102',
    array['00000000-0000-0000-0000-0000009950e1', '00000000-0000-0000-0000-0000009950e2']::uuid[]);
  owner_got jsonb := pg_temp.places_as('00000000-0000-0000-0000-000000995103',
    array['00000000-0000-0000-0000-0000009950e2']::uuid[]);
begin
  if handler_got <> jsonb_build_object(
       '00000000-0000-0000-0000-0000009950e1', null,
       '00000000-0000-0000-0000-0000009950e2', 2) then
    raise exception 'FAIL handler: got %', handler_got;
  end if;
  if owner_got <> jsonb_build_object('00000000-0000-0000-0000-0000009950e2', 2) then
    raise exception 'FAIL dog owner: got %', owner_got;
  end if;
  raise notice 'PASS handler and dog owner see their own places';
end;
$$;

-- 4. Never another exhibitor's entry: a stranger asking for every id gets
-- nothing, and the owner asking for a mix gets only their own rows.
do $$
declare
  every_id uuid[] := (select array_agg(e.id) from public.entries e
                       where e.show_id = '00000000-0000-0000-0000-000000995002');
  stranger_got jsonb := pg_temp.places_as('00000000-0000-0000-0000-000000995104', every_id);
  unlinked_got jsonb := pg_temp.places_as('00000000-0000-0000-0000-000000995199', every_id);
  owner_got jsonb := pg_temp.places_as('00000000-0000-0000-0000-000000995101', every_id);
begin
  if stranger_got <> '{}'::jsonb then
    raise exception 'FAIL leak: an unrelated exhibitor got %', stranger_got;
  end if;
  if unlinked_got <> '{}'::jsonb then
    raise exception 'FAIL leak: an unlinked account got %', unlinked_got;
  end if;
  if owner_got ? '00000000-0000-0000-0000-0000009950e1'
     or owner_got ? '00000000-0000-0000-0000-0000009950e2' then
    raise exception 'FAIL leak: the owner got a stranger''s entry: %', owner_got;
  end if;
  raise notice 'PASS no other exhibitor''s entries are returned';
end;
$$;

-- 5. Counts only: the function's result shape carries no identity column.
do $$
begin
  if pg_get_function_result('public.get_my_entry_queue_places(uuid[])'::regprocedure)
       <> 'TABLE(entry_id uuid, place integer)' then
    raise exception 'FAIL shape: %',
      pg_get_function_result('public.get_my_entry_queue_places(uuid[])'::regprocedure);
  end if;
  raise notice 'PASS result carries entry_id and place only';
end;
$$;

-- 6. anon cannot execute it at all.
do $$
begin
  begin
    perform pg_temp.places_as(null, array[pg_temp.fx_id('a1')], 'anon');
    raise exception 'FAIL anon: call succeeded';
  exception when insufficient_privilege then
    raise notice 'PASS anon is refused';
  end;
end;
$$;

-- 7. Grants: EXECUTE for authenticated and service_role only, never PUBLIC/anon.
do $$
begin
  if has_function_privilege('anon', 'public.get_my_entry_queue_places(uuid[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_my_entry_queue_places(uuid[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_my_entry_queue_places(uuid[])', 'EXECUTE')
     or exists (
       select 1 from pg_proc p, aclexplode(p.proacl) a
        where p.oid = 'public.get_my_entry_queue_places(uuid[])'::regprocedure
          and a.grantee = 0
     ) then
    raise exception 'FAIL grants on get_my_entry_queue_places';
  end if;
  raise notice 'PASS grants';
end;
$$;

rollback;
