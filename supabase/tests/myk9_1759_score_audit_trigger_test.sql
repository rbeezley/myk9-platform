-- MYK9-1759: score changes that bypass ringside_update_entry are audited by the
-- entries_score_audit row trigger; the RPC's own writes are not audited twice.
--
-- Sections:
--   A. a signed-in manager's direct UPDATE of a score column writes one
--      'manager' row naming the person and the {old,new} diff (changed keys only)
--   B. an UPDATE of a non-score column, and a no-op UPDATE of a score column,
--      write nothing
--   C. an RPC write writes exactly ONE row (the RPC's), not two
--   D. a direct UPDATE after an RPC call in the SAME transaction is audited
--   E. an UPDATE with no auth user writes a 'system' row with no actor
--   G. anonymous signed-in uid is 'system'; the trigger function is not
--      executable by authenticated/anon; an RPC write that completes a class
--      leaves one RPC row for its own entry and 'system' rows for the real
--      placement cascade (both entries' final_placement)
--   F. a score change made from inside a trigger (depth 2) is 'system' even for
--      a signed-in actor
--   (B also asserts a check-in-only UPDATE writes no row: check-in columns are
--   deliberately not audited by the trigger)
--
-- Direct UPDATEs run as the table owner with the caller's JWT claims set, which is
-- all the trigger reads (auth.uid()); this avoids depending on the column-level
-- UPDATE grants of `authenticated`. Fixtures roll back. Behavioral SQL tests run
-- only in CI (no container runtime on the development Mac).

begin;

update public.ringside_containment
   set state = 'armed', tripped_at = null, trip_conflict_delta = null, trip_reason = null;

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001759011', 'Trigger', 'Admin',
   '00000000-0000-0000-0000-000001759101');
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001759011', r.id, true,
       '00000000-0000-0000-0000-000001759101'
  from public.roles r where r.name = 'site_admin';

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000001759020', 'MYK9-1759 Audit Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000001759021', 'MYK9-1759 Audit Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000001759020', 'published');
insert into public.trials (id, show_id, name, date)
values ('00000000-0000-0000-0000-000001759022', '00000000-0000-0000-0000-000001759021',
        'MYK9-1759 Audit Trial', current_date);
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000001759023', '00000000-0000-0000-0000-000001759022',
        'Container Novice', 'upcoming');
insert into public.dogs (id, name, call_name, breed, owner_id)
values ('00000000-0000-0000-0000-000001759024', 'Trigger Dog', 'Trigger Dog', 'Beagle',
        '00000000-0000-0000-0000-000001759011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000001759024', 'AKC (American Kennel Club)',
        'SR' || upper(substr(md5('00000000-0000-0000-0000-000001759024'), 1, 8)), true);
insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
  payment_status, entry_fee
) values
  ('00000000-0000-0000-0000-000001759033', '00000000-0000-0000-0000-000001759024',
   '00000000-0000-0000-0000-000001759023', '00000000-0000-0000-0000-000001759021',
   '00000000-0000-0000-0000-000001759022', '00000000-0000-0000-0000-000001759011',
   'confirmed', 'paid', 25);

-- Fixture inserts are not UPDATEs; there must be no audit rows yet.
do $$
begin
  if (select count(*) from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001759033') <> 0 then
    raise exception 'FAIL fixture setup produced audit rows';
  end if;
end;
$$;

create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.as_nobody() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claims', '', true);
$$;
create or replace function pg_temp.audit_count() returns integer language sql as $$
  select count(*)::integer from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001759033';
$$;

-- ===========================================================================
-- A. A manager's direct UPDATE of a score column.
-- ===========================================================================
select pg_temp.as_account('00000000-0000-0000-0000-000001759101');

update public.entries
   set is_scored = true, result_status = 'nq', entry_status = 'confirmed'
 where id = '00000000-0000-0000-0000-000001759033';

do $$
declare
  r public.entry_score_audit%rowtype;
begin
  if pg_temp.audit_count() <> 1 then
    raise exception 'FAIL expected one row after one direct UPDATE, got %', pg_temp.audit_count();
  end if;
  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001759033';
  if r.actor_tier <> 'manager' then raise exception 'FAIL tier %', r.actor_tier; end if;
  if r.actor_user_id <> '00000000-0000-0000-0000-000001759101'
     or r.actor_person_id <> '00000000-0000-0000-0000-000001759011'
     or r.actor_display_name <> 'Trigger Admin' then
    raise exception 'FAIL actor % / % / %', r.actor_user_id, r.actor_person_id, r.actor_display_name;
  end if;
  if r.client_saved_at is not null or r.passcode_role is not null then
    raise exception 'FAIL trigger row carried RPC-only columns';
  end if;
  if r.show_id <> '00000000-0000-0000-0000-000001759021'
     or r.class_id <> '00000000-0000-0000-0000-000001759023' then
    raise exception 'FAIL show/class %/%', r.show_id, r.class_id;
  end if;
  if r.entry_version is distinct from
     (select e.version from public.entries e where e.id = r.entry_id) then
    raise exception 'FAIL entry_version %', r.entry_version;
  end if;
  if r.changes -> 'is_scored' ->> 'new' <> 'true'
     or r.changes -> 'result_status' ->> 'new' <> 'nq' then
    raise exception 'FAIL diff %', r.changes;
  end if;
  if r.changes ? 'entry_status' then
    raise exception 'FAIL diff lists a non-score column: %', r.changes;
  end if;
  raise notice 'PASS a manager direct UPDATE writes one manager row with person and diff';
end;
$$;

-- ===========================================================================
-- B. Non-score column, and a no-op write of a score column, write nothing.
-- ===========================================================================
update public.entries set special_requests = 'MYK9-1759 harmless note'
 where id = '00000000-0000-0000-0000-000001759033';
update public.entries set result_status = 'nq', is_scored = true
 where id = '00000000-0000-0000-0000-000001759033';

do $$
begin
  if pg_temp.audit_count() <> 1 then
    raise exception 'FAIL non-score / no-op UPDATE audited: % rows', pg_temp.audit_count();
  end if;
  raise notice 'PASS non-score and unchanged-score UPDATEs write nothing';
end;
$$;

do $$
declare
  v_before integer := pg_temp.audit_count();
begin
  -- Runs before any placement is set: the class refresh a check-in change fires
  -- then has no final_placement to rewrite, so only the trigger can add a row.
  update public.entries set check_in_status = 'at-gate', is_in_ring = true, run_order = 7
   where id = '00000000-0000-0000-0000-000001759033';
  if pg_temp.audit_count() <> v_before then
    raise exception 'FAIL a check-in-only UPDATE wrote an audit row';
  end if;
  raise notice 'PASS a check-in-only direct UPDATE writes no row';
end;
$$;

-- ===========================================================================
-- C + D. One RPC call = one row; a later direct UPDATE in the same transaction
-- is still audited.
-- ===========================================================================
do $$
declare
  v_version integer;
begin
  select version into strict v_version from public.entries
   where id = '00000000-0000-0000-0000-000001759033';
  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001759033',
    jsonb_build_object('search_time_seconds', 55), v_version, null);
  if pg_temp.audit_count() <> 2 then
    raise exception 'FAIL RPC write produced % total rows, expected 2 (one new)',
      pg_temp.audit_count();
  end if;
  if (select count(*) from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001759033'
         and changes ? 'search_time_seconds') <> 1 then
    raise exception 'FAIL RPC write audited twice';
  end if;
  if current_setting('myk9.score_audit_by_rpc', true) is distinct from '' then
    raise exception 'FAIL the RPC flag was not cleared: %', current_setting('myk9.score_audit_by_rpc', true);
  end if;
  raise notice 'PASS an RPC write leaves exactly one row and clears the flag';
end;
$$;

update public.entries set search_time_seconds = 61
 where id = '00000000-0000-0000-0000-000001759033';

do $$
begin
  if pg_temp.audit_count() <> 3 then
    raise exception 'FAIL direct UPDATE after an RPC call not audited: % rows', pg_temp.audit_count();
  end if;
  if (select actor_tier from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001759033'
         and (changes -> 'search_time_seconds' ->> 'new')::numeric = 61) <> 'manager' then
    raise exception 'FAIL later direct UPDATE not recorded as manager';
  end if;
  raise notice 'PASS a direct UPDATE after an RPC call in the same transaction is audited';
end;
$$;

-- ===========================================================================
-- E. No auth user: system, no actor.
-- ===========================================================================
select pg_temp.as_nobody();
update public.entries set final_placement = 2
 where id = '00000000-0000-0000-0000-000001759033';

do $$
declare
  r public.entry_score_audit%rowtype;
begin
  if pg_temp.audit_count() <> 4 then
    raise exception 'FAIL no-auth UPDATE not audited: % rows', pg_temp.audit_count();
  end if;
  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001759033'
     and changes ? 'final_placement';
  if r.actor_tier <> 'system' or r.actor_user_id is not null
     or r.actor_person_id is not null or r.actor_display_name is not null then
    raise exception 'FAIL system row carries an actor: % / % / %',
      r.actor_tier, r.actor_user_id, r.actor_display_name;
  end if;
  if (r.changes -> 'final_placement' ->> 'new')::integer <> 2 then
    raise exception 'FAIL final_placement diff %', r.changes;
  end if;
  raise notice 'PASS a no-auth UPDATE writes a system row with no actor';
end;
$$;

-- ===========================================================================
-- F. A change made from inside another trigger (depth 2) is system even for a
-- signed-in actor.
-- ===========================================================================
select pg_temp.as_account('00000000-0000-0000-0000-000001759101');

create function pg_temp.nested_placement() returns trigger language plpgsql as $$
begin
  update public.entries set final_placement = 3
   where id = '00000000-0000-0000-0000-000001759033';
  return null;
end;
$$;
create temporary table myk9_1759_poke (id int);
create trigger nested_placement after insert on myk9_1759_poke
  for each row execute function pg_temp.nested_placement();
insert into myk9_1759_poke values (1);

do $$
declare
  r public.entry_score_audit%rowtype;
begin
  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001759033'
     and (changes -> 'final_placement' ->> 'new')::integer = 3;
  if r.actor_tier <> 'system' then
    raise exception 'FAIL trigger-nested change tier %, expected system', r.actor_tier;
  end if;
  if r.actor_user_id <> '00000000-0000-0000-0000-000001759101' then
    raise exception 'FAIL nested system row lost the signed-in user';
  end if;
  raise notice 'PASS a change made inside a trigger is system and keeps the signed-in user';
end;
$$;

-- ===========================================================================
-- G. Anonymous uid, function privileges, and the real placement cascade.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001759199', true),
       set_config('request.jwt.claims', jsonb_build_object(
         'sub', '00000000-0000-0000-0000-000001759199', 'role', 'authenticated',
         'is_anonymous', true)::text, true);
update public.entries set total_faults = 5
 where id = '00000000-0000-0000-0000-000001759033';
do $$
declare
  r public.entry_score_audit%rowtype;
begin
  select * into strict r from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001759033' and changes ? 'total_faults';
  if r.actor_tier <> 'system' or r.actor_user_id <> '00000000-0000-0000-0000-000001759199' then
    raise exception 'FAIL anonymous uid row: % / %', r.actor_tier, r.actor_user_id;
  end if;
  raise notice 'PASS an anonymous signed-in uid is recorded as system';
end;
$$;

do $$
begin
  if has_function_privilege('authenticated', 'public.entries_score_audit_trigger()', 'execute')
     or has_function_privilege('anon', 'public.entries_score_audit_trigger()', 'execute') then
    raise exception 'FAIL the audit trigger function is executable by a client role';
  end if;
  raise notice 'PASS the audit trigger function is not executable by authenticated or anon';
end;
$$;

-- Cascade fixture: a second class with two entries (A via the RPC, B directly).
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000001759043', '00000000-0000-0000-0000-000001759022',
        'Interior Novice', 'upcoming');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000001759061', 'Cascade A', 'Cascade A', 'Beagle',
   '00000000-0000-0000-0000-000001759011'),
  ('00000000-0000-0000-0000-000001759062', 'Cascade B', 'Cascade B', 'Beagle',
   '00000000-0000-0000-0000-000001759011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select d, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d::text), 1, 8)), true
  from unnest(array['00000000-0000-0000-0000-000001759061',
                    '00000000-0000-0000-0000-000001759062']::uuid[]) as d;
insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
  payment_status, entry_fee
) values
  ('00000000-0000-0000-0000-000001759051', '00000000-0000-0000-0000-000001759061',
   '00000000-0000-0000-0000-000001759043', '00000000-0000-0000-0000-000001759021',
   '00000000-0000-0000-0000-000001759022', '00000000-0000-0000-0000-000001759011',
   'confirmed', 'paid', 25),
  ('00000000-0000-0000-0000-000001759052', '00000000-0000-0000-0000-000001759062',
   '00000000-0000-0000-0000-000001759043', '00000000-0000-0000-0000-000001759021',
   '00000000-0000-0000-0000-000001759022', '00000000-0000-0000-0000-000001759011',
   'confirmed', 'paid', 25);

select pg_temp.as_account('00000000-0000-0000-0000-000001759101');
-- B is scored first (class still in progress, so no placement yet).
update public.entries
   set is_scored = true, result_status = 'qualified', total_faults = 0, search_time_seconds = 30
 where id = '00000000-0000-0000-0000-000001759052';

do $$
declare
  v_version integer;
begin
  if exists (select 1 from public.entries
              where class_id = '00000000-0000-0000-0000-000001759043'
                and final_placement is not null) then
    raise exception 'FAIL fixture: a placement was set before the class was fully scored';
  end if;
  select version into strict v_version from public.entries
   where id = '00000000-0000-0000-0000-000001759051';
  -- A's RPC write completes the class; the entries trigger then recalculates
  -- placements for both entries inside the same statement (trigger depth 2).
  perform public.ringside_update_entry(
    '00000000-0000-0000-0000-000001759051',
    jsonb_build_object('is_scored', true, 'result_status', 'qualified',
                       'total_faults', 1, 'search_time_seconds', 40),
    v_version, null);

  if (select final_placement from public.entries
       where id = '00000000-0000-0000-0000-000001759052') is distinct from 1
     or (select final_placement from public.entries
          where id = '00000000-0000-0000-0000-000001759051') is distinct from 2 then
    raise exception 'FAIL fixture: the cascade did not place the entries 1 and 2';
  end if;

  -- A: exactly one non-system row (the RPC's own), plus system rows for the cascade.
  if (select count(*) from public.entry_score_audit
       where entry_id = '00000000-0000-0000-0000-000001759051'
         and actor_tier <> 'system') <> 1 then
    raise exception 'FAIL entry A has % non-system rows, expected exactly 1 (the RPC row)',
      (select count(*) from public.entry_score_audit
        where entry_id = '00000000-0000-0000-0000-000001759051' and actor_tier <> 'system');
  end if;
  if not exists (select 1 from public.entry_score_audit
                  where entry_id = '00000000-0000-0000-0000-000001759051'
                    and actor_tier = 'manager' and changes ? 'is_scored'
                    and not changes ? 'final_placement') then
    raise exception 'FAIL entry A is missing its RPC row';
  end if;
  if not exists (select 1 from public.entry_score_audit
                  where entry_id = '00000000-0000-0000-0000-000001759051'
                    and actor_tier = 'system'
                    and (changes -> 'final_placement' ->> 'new')::integer = 2) then
    raise exception 'FAIL entry A has no system row for its cascaded placement';
  end if;
  -- B: a system row for the placement it did not write itself.
  if not exists (select 1 from public.entry_score_audit
                  where entry_id = '00000000-0000-0000-0000-000001759052'
                    and actor_tier = 'system'
                    and (changes -> 'final_placement' ->> 'new')::integer = 1) then
    raise exception 'FAIL entry B has no system row for its cascaded placement';
  end if;
  raise notice 'PASS an RPC write that completes a class: one RPC row, system rows for the cascade';
end;
$$;

rollback;
