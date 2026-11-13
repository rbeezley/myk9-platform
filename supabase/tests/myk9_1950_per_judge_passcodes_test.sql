-- MYK9-1950: per-judge passcodes, server half.
--
-- Sections:
--   A. codes follow judge_assignments: one code per judge per show with person_id, none for a
--      declined/cancelled assignment, a second code for one judge refused (23505), one code per
--      role for the other roles, the unique-per-class judge index still refuses a second
--      confirmed judge
--   B. validate_passcode carries the judge's person_id (NULL for the admin code)
--   C. scope: a judge's code writes a class assigned to that judge (and the audit row names the
--      passcode and the judge); it is refused with RS403 'This class is judged by <name>' on
--      another judge's class and 'no judge assigned' on an unassigned class; the admin code still
--      scores any class; the steward code is unchanged; a judge claim with no person id (the
--      old show-wide shape) is refused as revoked
--   D. reassignment through set_class_judge moves the class between judges WITHOUT regenerating
--      any code: the new judge writes at once, the old judge is refused, both codes keep their
--      hash and generation; removing a judge's last class retires their code
--   E. per-code revocation: regenerating one judge's code stales only that code's claim
--   F. get_show_access_codes: a manager reads every judge's code with name and person_id
--
-- Fixtures roll back. Conventions match myk9_1754_entry_score_audit_test.sql. Runs only in CI.

begin;

insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001950011', 'Sia', 'SiteAdmin', '00000000-0000-0000-0000-000001950101'),
  ('00000000-0000-0000-0000-000001950012', 'Plain', 'User', '00000000-0000-0000-0000-000001950102'),
  ('00000000-0000-0000-0000-000001950021', 'Alice', 'JudgeA', NULL),
  ('00000000-0000-0000-0000-000001950022', 'Bob', 'JudgeB', NULL),
  ('00000000-0000-0000-0000-000001950023', 'Cara', 'JudgeC', NULL);
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000001950011', r.id, true, '00000000-0000-0000-0000-000001950101'
  from public.roles r where r.name = 'site_admin';

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000001950030', 'MYK9-1950 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000001950031', 'MYK9-1950 Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000001950030', 'published');
insert into public.trials (id, show_id, name, date)
values ('00000000-0000-0000-0000-000001950032', '00000000-0000-0000-0000-000001950031',
        'MYK9-1950 Trial', current_date);
insert into public.classes (id, trial_id, name, status) values
  ('00000000-0000-0000-0000-000001950041', '00000000-0000-0000-0000-000001950032', 'Ring 1 Container', 'upcoming'),
  ('00000000-0000-0000-0000-000001950042', '00000000-0000-0000-0000-000001950032', 'Ring 2 Interior', 'upcoming'),
  ('00000000-0000-0000-0000-000001950043', '00000000-0000-0000-0000-000001950032', 'Ring 1 Exterior', 'upcoming'),
  ('00000000-0000-0000-0000-000001950044', '00000000-0000-0000-0000-000001950032', 'Unassigned Buried', 'upcoming');

insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000001950051', 'Dog One', 'Dog One', 'Beagle', '00000000-0000-0000-0000-000001950012'),
  ('00000000-0000-0000-0000-000001950052', 'Dog Two', 'Dog Two', 'Beagle', '00000000-0000-0000-0000-000001950012'),
  ('00000000-0000-0000-0000-000001950053', 'Dog Three', 'Dog Three', 'Beagle', '00000000-0000-0000-0000-000001950012'),
  ('00000000-0000-0000-0000-000001950054', 'Dog Four', 'Dog Four', 'Beagle', '00000000-0000-0000-0000-000001950012');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select d.id, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d.id::text), 1, 8)), true
  from public.dogs d
 where d.id::text like '00000000-0000-0000-0000-00000195005%';
insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, payment_status, entry_fee
) values
  ('00000000-0000-0000-0000-000001950061', '00000000-0000-0000-0000-000001950051',
   '00000000-0000-0000-0000-000001950041', '00000000-0000-0000-0000-000001950031',
   '00000000-0000-0000-0000-000001950032', '00000000-0000-0000-0000-000001950012', 'confirmed', 'paid', 25),
  ('00000000-0000-0000-0000-000001950062', '00000000-0000-0000-0000-000001950052',
   '00000000-0000-0000-0000-000001950042', '00000000-0000-0000-0000-000001950031',
   '00000000-0000-0000-0000-000001950032', '00000000-0000-0000-0000-000001950012', 'confirmed', 'paid', 25),
  ('00000000-0000-0000-0000-000001950063', '00000000-0000-0000-0000-000001950053',
   '00000000-0000-0000-0000-000001950043', '00000000-0000-0000-0000-000001950031',
   '00000000-0000-0000-0000-000001950032', '00000000-0000-0000-0000-000001950012', 'confirmed', 'paid', 25),
  ('00000000-0000-0000-0000-000001950064', '00000000-0000-0000-0000-000001950054',
   '00000000-0000-0000-0000-000001950044', '00000000-0000-0000-0000-000001950031',
   '00000000-0000-0000-0000-000001950032', '00000000-0000-0000-0000-000001950012', 'confirmed', 'paid', 25);

-- ===========================================================================
-- A. Codes follow judge_assignments.
-- ===========================================================================
-- A judges C1 (ring 1) and C3 (ring 1), B judges C2 (ring 2). C is declined, so gets no code.
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at) values
  ('00000000-0000-0000-0000-000001950021', '00000000-0000-0000-0000-000001950031', NULL,
   '00000000-0000-0000-0000-000001950041', 'confirmed', now()),
  ('00000000-0000-0000-0000-000001950021', '00000000-0000-0000-0000-000001950031', NULL,
   '00000000-0000-0000-0000-000001950043', 'confirmed', now()),
  ('00000000-0000-0000-0000-000001950022', '00000000-0000-0000-0000-000001950031', NULL,
   '00000000-0000-0000-0000-000001950042', 'confirmed', now());
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status) values
  ('00000000-0000-0000-0000-000001950023', '00000000-0000-0000-0000-000001950031', NULL,
   '00000000-0000-0000-0000-000001950044', 'declined');

do $$
declare
  v_show constant uuid := '00000000-0000-0000-0000-000001950031';
begin
  if (select count(*) from public.show_passcodes where show_id = v_show and role = 'judge') <> 2 then
    raise exception 'FAIL A.1 expected two judge codes (A and B), got %',
      (select count(*) from public.show_passcodes where show_id = v_show and role = 'judge');
  end if;
  if (select count(*) from public.show_passcodes
       where show_id = v_show and role = 'judge'
         and person_id in ('00000000-0000-0000-0000-000001950021',
                           '00000000-0000-0000-0000-000001950022')) <> 2 then
    raise exception 'FAIL A.2 each judge code must carry that judge''s person_id';
  end if;
  if exists (select 1 from public.show_passcodes
              where show_id = v_show and person_id = '00000000-0000-0000-0000-000001950023') then
    raise exception 'FAIL A.3 a declined assignment must not create a code';
  end if;
  if (select count(*) from public.show_passcodes
       where show_id = v_show and person_id = '00000000-0000-0000-0000-000001950021') <> 1 then
    raise exception 'FAIL A.4 two classes for one judge must share one code';
  end if;
  if (select count(distinct passcode_hash) from public.show_passcodes where show_id = v_show) <> 2 then
    raise exception 'FAIL A.5 judge codes must be distinct';
  end if;
  if (select count(*) from public.show_passcodes
       where show_id = v_show and passcode_ciphertext is not null and role = 'judge') <> 2 then
    raise exception 'FAIL A.6 judge codes must be recoverable (ciphertext stored)';
  end if;
  if (select passcode_hash from public.show_passcodes
       where show_id = v_show and person_id = '00000000-0000-0000-0000-000001950021') !~ '^[0-9a-f]{64}$' then
    raise exception 'FAIL A.7 judge code is stored as an HMAC hex hash';
  end if;
  raise notice 'PASS A.1-A.7 judge codes are created from assignments (declined excluded), one per judge';
end;
$$;

-- A second code for the same judge in the same show is refused.
do $$
begin
  begin
    insert into public.show_passcodes (show_id, role, passcode_hash, person_id) values
      ('00000000-0000-0000-0000-000001950031', 'judge', 'myk9-1950-dup-judge',
       '00000000-0000-0000-0000-000001950021');
    raise exception 'FAIL A.8 a second judge code for one person was accepted';
  exception when unique_violation then
    raise notice 'PASS A.8 one judge code per person per show';
  end;
end;
$$;

-- One confirmed judge per class (MYK9-1466 / MYK9-1327) is still enforced by the database.
do $$
begin
  begin
    insert into public.judge_assignments (person_id, show_id, class_id, status, confirmed_at) values
      ('00000000-0000-0000-0000-000001950022', '00000000-0000-0000-0000-000001950031',
       '00000000-0000-0000-0000-000001950041', 'confirmed', now());
    raise exception 'FAIL A.9 a second confirmed judge on one class was accepted';
  exception when unique_violation then
    raise notice 'PASS A.9 one confirmed judge per class';
  end;
end;
$$;

-- The other roles keep one code per role per show; judge rows do not collide with them.
insert into public.show_passcodes (show_id, role, passcode_hash) values
  ('00000000-0000-0000-0000-000001950031', 'admin', 'myk9-1950-admin'),
  ('00000000-0000-0000-0000-000001950031', 'steward', 'myk9-1950-steward');
do $$
begin
  begin
    insert into public.show_passcodes (show_id, role, passcode_hash) values
      ('00000000-0000-0000-0000-000001950031', 'admin', 'myk9-1950-admin-2');
    raise exception 'FAIL A.10 a second admin code was accepted';
  exception when unique_violation then
    raise notice 'PASS A.10 one code per role for the other roles';
  end;
end;
$$;

-- Everything below reads results across the role boundary through this table.
create temporary table myk9_1950 (step text primary key, value text) on commit drop;
grant select, insert, update on myk9_1950 to authenticated;

insert into myk9_1950
select 'a_hash', passcode_hash from public.show_passcodes
 where show_id = '00000000-0000-0000-0000-000001950031' and person_id = '00000000-0000-0000-0000-000001950021';
insert into myk9_1950
select 'a_gen', created_at::text from public.show_passcodes
 where show_id = '00000000-0000-0000-0000-000001950031' and person_id = '00000000-0000-0000-0000-000001950021';
insert into myk9_1950
select 'b_hash', passcode_hash from public.show_passcodes
 where show_id = '00000000-0000-0000-0000-000001950031' and person_id = '00000000-0000-0000-0000-000001950022';
insert into myk9_1950
select 'b_gen', created_at::text from public.show_passcodes
 where show_id = '00000000-0000-0000-0000-000001950031' and person_id = '00000000-0000-0000-0000-000001950022';
insert into myk9_1950
select 'b_id', id::text from public.show_passcodes
 where show_id = '00000000-0000-0000-0000-000001950031' and person_id = '00000000-0000-0000-0000-000001950022';

-- ===========================================================================
-- B. validate_passcode carries the judge's person_id.
-- ===========================================================================
-- Known plaintexts: set two codes to codes whose hash we can compute.
update public.show_passcodes
   set passcode_hash = public._hash_passcode('j1950'),
       passcode_ciphertext = public._encrypt_show_passcode('j1950')
 where show_id = '00000000-0000-0000-0000-000001950031'
   and person_id = '00000000-0000-0000-0000-000001950021';
update public.show_passcodes
   set passcode_hash = public._hash_passcode('a1950')
 where show_id = '00000000-0000-0000-0000-000001950031' and role = 'admin';
update myk9_1950 set value = (
  select passcode_hash from public.show_passcodes
   where show_id = '00000000-0000-0000-0000-000001950031'
     and person_id = '00000000-0000-0000-0000-000001950021') where step = 'a_hash';

set local role service_role;
do $$
declare
  r record;
begin
  select * into strict r from public.validate_passcode('j1950');
  if r.role <> 'judge' or r.person_id is distinct from '00000000-0000-0000-0000-000001950021'::uuid
     or r.show_id <> '00000000-0000-0000-0000-000001950031'::uuid
     or r.passcode_generation is null then
    raise exception 'FAIL B.1 judge code must validate with its person_id, got %', to_jsonb(r);
  end if;
  select * into strict r from public.validate_passcode('a1950');
  if r.role <> 'admin' or r.person_id is not null then
    raise exception 'FAIL B.2 admin code must validate with a NULL person_id, got %', to_jsonb(r);
  end if;
  if exists (select 1 from public.validate_passcode('nope1')) then
    raise exception 'FAIL B.3 an unknown code must not validate';
  end if;
  raise notice 'PASS B validate_passcode carries person_id for judge codes only';
end;
$$;
reset role;

-- ===========================================================================
-- C. Scope at write time.
-- ===========================================================================
create or replace function pg_temp.as_passcode(p_role text, p_person text, p_generation text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001950199', true),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', '00000000-0000-0000-0000-000001950199',
           'role', 'authenticated',
           'is_anonymous', true,
           'app_metadata', jsonb_strip_nulls(jsonb_build_object(
             'kind', 'ringside_passcode',
             'show_id', '00000000-0000-0000-0000-000001950031',
             'ringside_role', p_role,
             'ringside_person_id', p_person,
             'passcode_generation', p_generation)))::text, true);
$$;
create or replace function pg_temp.as_account(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims',
           jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
-- One write attempt. Records SQLSTATE | message | detail, or 'ok'.
create or replace function pg_temp.attempt(p_label text, p_entry uuid, p_fields jsonb)
returns void language plpgsql as $$
declare
  v_detail text;
  v_outcome text;
begin
  begin
    perform public.ringside_update_entry(p_entry, p_fields, null);
    v_outcome := 'ok';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_outcome := sqlstate || '|' || sqlerrm || '|' || coalesce(v_detail, '');
  end;
  insert into myk9_1950 values (p_label, v_outcome)
  on conflict (step) do update set value = excluded.value;
end;
$$;
grant execute on function pg_temp.as_passcode(text, text, text) to authenticated;
grant execute on function pg_temp.as_account(uuid) to authenticated;
grant execute on function pg_temp.attempt(text, uuid, jsonb) to authenticated;

create or replace function pg_temp.fields() returns jsonb language sql as $$
  select jsonb_build_object('is_scored', true, 'result_status', 'nq',
                            'search_time_seconds', 42, 'disqualification_reason', 'Incorrect Call')
$$;
grant execute on function pg_temp.fields() to authenticated;

insert into myk9_1950
select role || '_gen', created_at::text from public.show_passcodes
 where show_id = '00000000-0000-0000-0000-000001950031' and role in ('admin', 'steward');

set local role authenticated;

-- A's code on A's class (C1): allowed.
select pg_temp.as_passcode('judge', '00000000-0000-0000-0000-000001950021',
  (select value from myk9_1950 where step = 'a_gen'));
select pg_temp.attempt('c1_own', '00000000-0000-0000-0000-000001950061', pg_temp.fields());
-- A's code on B's class (C2): refused.
select pg_temp.attempt('c2_other', '00000000-0000-0000-0000-000001950062', pg_temp.fields());
-- A's code on a class nobody judges (C4): refused.
select pg_temp.attempt('c3_unassigned', '00000000-0000-0000-0000-000001950064', pg_temp.fields());
-- A's code on A's second class (C3): allowed.
select pg_temp.attempt('c4_second_own', '00000000-0000-0000-0000-000001950063', pg_temp.fields());

-- The admin code still scores any class.
select pg_temp.as_passcode('admin', NULL, (select value from myk9_1950 where step = 'admin_gen'));
select pg_temp.attempt('admin_any', '00000000-0000-0000-0000-000001950062', pg_temp.fields());

-- The steward code is unchanged: check-in columns only, any class; scoring keys are dropped.
select pg_temp.as_passcode('steward', NULL, (select value from myk9_1950 where step = 'steward_gen'));
select pg_temp.attempt('steward_checkin', '00000000-0000-0000-0000-000001950062',
  jsonb_build_object('run_order', 7));

-- A judge claim with no person id (the old show-wide shape) is refused as revoked.
select pg_temp.as_passcode('judge', NULL, (select value from myk9_1950 where step = 'a_gen'));
select pg_temp.attempt('no_person', '00000000-0000-0000-0000-000001950061', pg_temp.fields());

-- A claim naming a person who has no code at all is refused as revoked (never a scope error).
select pg_temp.as_passcode('judge', '00000000-0000-0000-0000-000001950023',
  (select value from myk9_1950 where step = 'a_gen'));
select pg_temp.attempt('no_code', '00000000-0000-0000-0000-000001950061', pg_temp.fields());

reset role;

do $$
declare
  v_a_id uuid;
  v_audit public.entry_score_audit%rowtype;
  v_out text;
begin
  select value into v_out from myk9_1950 where step = 'c1_own';
  if v_out <> 'ok' then raise exception 'FAIL C.1 judge A on its own class: %', v_out; end if;

  select value into v_out from myk9_1950 where step = 'c2_other';
  if v_out not like 'RS403|This class is judged by Bob JudgeB|00000000-0000-0000-0000-000001950022' then
    raise exception 'FAIL C.2 judge A on judge B''s class: %', v_out;
  end if;
  if exists (select 1 from public.entry_score_audit
              where entry_id = '00000000-0000-0000-0000-000001950062' and actor_tier = 'passcode_judge') then
    raise exception 'FAIL C.3 a refused write left an audit row';
  end if;

  select value into v_out from myk9_1950 where step = 'c3_unassigned';
  if v_out not like 'RS403|This class has no judge assigned|%' then
    raise exception 'FAIL C.4 judge A on an unassigned class: %', v_out;
  end if;

  select value into v_out from myk9_1950 where step = 'c4_second_own';
  if v_out <> 'ok' then raise exception 'FAIL C.5 judge A on its second class: %', v_out; end if;

  select value into v_out from myk9_1950 where step = 'admin_any';
  if v_out <> 'ok' then raise exception 'FAIL C.6 admin code on any class: %', v_out; end if;

  select value into v_out from myk9_1950 where step = 'steward_checkin';
  if v_out <> 'ok' then raise exception 'FAIL C.7 steward check-in write: %', v_out; end if;

  select value into v_out from myk9_1950 where step = 'no_person';
  if v_out not like '42501|Passcode has been regenerated%' then
    raise exception 'FAIL C.8 a judge claim without person id must read as revoked: %', v_out;
  end if;

  select value into v_out from myk9_1950 where step = 'no_code';
  if v_out not like '42501|Passcode has been regenerated%' then
    raise exception 'FAIL C.9 a claim for a person without a code must read as revoked: %', v_out;
  end if;

  -- Audit (MYK9-1754): the passcode write names the passcode and the judge.
  select id into strict v_a_id from public.show_passcodes
   where show_id = '00000000-0000-0000-0000-000001950031'
     and person_id = '00000000-0000-0000-0000-000001950021';
  select * into strict v_audit from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001950061';
  if v_audit.actor_tier <> 'passcode_judge' or v_audit.passcode_id is distinct from v_a_id
     or v_audit.passcode_person_id is distinct from '00000000-0000-0000-0000-000001950021'::uuid then
    raise exception 'FAIL C.10 audit row must carry passcode id and judge person, got %', to_jsonb(v_audit);
  end if;
  select * into strict v_audit from public.entry_score_audit
   where entry_id = '00000000-0000-0000-0000-000001950062' and actor_tier = 'passcode_admin';
  if v_audit.passcode_person_id is not null or v_audit.passcode_id is null then
    raise exception 'FAIL C.11 admin audit row names the passcode and no judge, got %', to_jsonb(v_audit);
  end if;
  if not exists (select 1 from public.entry_score_audit
                  where entry_id = '00000000-0000-0000-0000-000001950062'
                    and actor_tier = 'passcode_steward' and passcode_person_id is null) then
    raise exception 'FAIL C.12 the steward write must audit as passcode_steward with no judge';
  end if;
  raise notice 'PASS C scope allowed, scope refused (RS403 with the judge''s name), admin and steward unchanged, audit names passcode and judge';
end;
$$;

-- ===========================================================================
-- D. Reassignment moves the class without regenerating any code.
-- ===========================================================================
-- Move C1 from A to B. A keeps C3, so A's code survives; B's code is the one it already had.
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001950101');
select public.set_class_judge('00000000-0000-0000-0000-000001950041',
                              '00000000-0000-0000-0000-000001950022');
reset role;

do $$
begin
  if (select passcode_hash from public.show_passcodes
       where show_id = '00000000-0000-0000-0000-000001950031'
         and person_id = '00000000-0000-0000-0000-000001950022')
     is distinct from (select value from myk9_1950 where step = 'b_hash')
     or (select created_at::text from public.show_passcodes
          where show_id = '00000000-0000-0000-0000-000001950031'
            and person_id = '00000000-0000-0000-0000-000001950022')
        is distinct from (select value from myk9_1950 where step = 'b_gen') then
    raise exception 'FAIL D.1 reassignment regenerated B''s code';
  end if;
  if (select passcode_hash from public.show_passcodes
       where show_id = '00000000-0000-0000-0000-000001950031'
         and person_id = '00000000-0000-0000-0000-000001950021')
     is distinct from (select value from myk9_1950 where step = 'a_hash')
     or (select created_at::text from public.show_passcodes
          where show_id = '00000000-0000-0000-0000-000001950031'
            and person_id = '00000000-0000-0000-0000-000001950021')
        is distinct from (select value from myk9_1950 where step = 'a_gen') then
    raise exception 'FAIL D.2 reassignment regenerated A''s code';
  end if;
  raise notice 'PASS D.1-D.2 reassignment leaves both codes untouched';
end;
$$;

set local role authenticated;
select pg_temp.as_passcode('judge', '00000000-0000-0000-0000-000001950022',
  (select value from myk9_1950 where step = 'b_gen'));
select pg_temp.attempt('d_new_judge', '00000000-0000-0000-0000-000001950061',
  pg_temp.fields());
select pg_temp.as_passcode('judge', '00000000-0000-0000-0000-000001950021',
  (select value from myk9_1950 where step = 'a_gen'));
select pg_temp.attempt('d_old_judge_moved', '00000000-0000-0000-0000-000001950061', pg_temp.fields());
select pg_temp.attempt('d_old_judge_kept', '00000000-0000-0000-0000-000001950063', pg_temp.fields());
reset role;

do $$
declare
  v_out text;
begin
  select value into v_out from myk9_1950 where step = 'd_new_judge';
  if v_out <> 'ok' then raise exception 'FAIL D.3 the new judge cannot score the moved class: %', v_out; end if;
  select value into v_out from myk9_1950 where step = 'd_old_judge_moved';
  if v_out not like 'RS403|This class is judged by Bob JudgeB|%' then
    raise exception 'FAIL D.4 the old judge can still score the moved class: %', v_out;
  end if;
  select value into v_out from myk9_1950 where step = 'd_old_judge_kept';
  if v_out <> 'ok' then raise exception 'FAIL D.5 the old judge lost a class they still hold: %', v_out; end if;
  raise notice 'PASS D.3-D.5 the class moved between judges at write time, no regeneration';
end;
$$;

-- Removing A's last class retires A's code; B's is untouched.
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001950101');
select public.set_class_judge('00000000-0000-0000-0000-000001950043', NULL);
reset role;

do $$
begin
  if exists (select 1 from public.show_passcodes
              where show_id = '00000000-0000-0000-0000-000001950031'
                and person_id = '00000000-0000-0000-0000-000001950021') then
    raise exception 'FAIL D.6 removing a judge''s last class must retire their code';
  end if;
  if not exists (select 1 from public.show_passcodes
                  where show_id = '00000000-0000-0000-0000-000001950031'
                    and person_id = '00000000-0000-0000-0000-000001950022') then
    raise exception 'FAIL D.7 B''s code must survive A''s retirement';
  end if;
  raise notice 'PASS D.6-D.7 the last class removed retires the code';
end;
$$;

set local role authenticated;
select pg_temp.as_passcode('judge', '00000000-0000-0000-0000-000001950021',
  (select value from myk9_1950 where step = 'a_gen'));
select pg_temp.attempt('d_retired', '00000000-0000-0000-0000-000001950063', pg_temp.fields());
reset role;
do $$
declare
  v_out text;
begin
  select value into v_out from myk9_1950 where step = 'd_retired';
  if v_out not like '42501|Passcode has been regenerated%' then
    raise exception 'FAIL D.8 a retired code''s claim must be revoked: %', v_out;
  end if;
  raise notice 'PASS D.8 a retired code''s claim is revoked';
end;
$$;

-- ===========================================================================
-- E. Per-code revocation.
-- ===========================================================================
-- Give A a class again (a fresh code), then regenerate ONE judge's code.
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001950101');
select public.set_class_judge('00000000-0000-0000-0000-000001950043',
                              '00000000-0000-0000-0000-000001950021');
reset role;
insert into myk9_1950
select 'a2_gen', created_at::text from public.show_passcodes
 where show_id = '00000000-0000-0000-0000-000001950031' and person_id = '00000000-0000-0000-0000-000001950021';

-- A non-manager cannot regenerate.
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001950102');
do $$
begin
  begin
    perform public.regenerate_judge_passcode('00000000-0000-0000-0000-000001950031',
                                             '00000000-0000-0000-0000-000001950022');
    insert into myk9_1950 values ('e_plain', 'ok');
  exception when others then
    insert into myk9_1950 values ('e_plain', sqlstate);
  end;
end;
$$;
-- The manager regenerates B only.
select pg_temp.as_account('00000000-0000-0000-0000-000001950101');
do $$
declare
  v_code text;
begin
  v_code := public.regenerate_judge_passcode('00000000-0000-0000-0000-000001950031',
                                             '00000000-0000-0000-0000-000001950022');
  insert into myk9_1950 values ('e_new_code', v_code);
end;
$$;
reset role;

do $$
declare
  v_code text := (select value from myk9_1950 where step = 'e_new_code');
  r record;
begin
  if (select value from myk9_1950 where step = 'e_plain') <> '42501' then
    raise exception 'FAIL E.1 a non-manager regenerated a judge code (%)',
      (select value from myk9_1950 where step = 'e_plain');
  end if;
  if v_code !~ '^j[a-z0-9]{4}$' then
    raise exception 'FAIL E.2 the new judge code must be a j-prefixed 5-char code, got %', v_code;
  end if;
  select * into strict r from public.validate_passcode(v_code);
  if r.person_id is distinct from '00000000-0000-0000-0000-000001950022'::uuid then
    raise exception 'FAIL E.3 the new code must validate as judge B, got %', to_jsonb(r);
  end if;
  if (select created_at::text from public.show_passcodes
       where show_id = '00000000-0000-0000-0000-000001950031'
         and person_id = '00000000-0000-0000-0000-000001950022')
     = (select value from myk9_1950 where step = 'b_gen') then
    raise exception 'FAIL E.4 B''s generation did not move';
  end if;
  if (select created_at::text from public.show_passcodes
       where show_id = '00000000-0000-0000-0000-000001950031'
         and person_id = '00000000-0000-0000-0000-000001950021')
     is distinct from (select value from myk9_1950 where step = 'a2_gen') then
    raise exception 'FAIL E.5 regenerating B moved A''s generation';
  end if;
  raise notice 'PASS E.1-E.5 one judge''s code regenerated, the other''s generation untouched';
end;
$$;

set local role authenticated;
select pg_temp.as_passcode('judge', '00000000-0000-0000-0000-000001950022',
  (select value from myk9_1950 where step = 'b_gen'));
select pg_temp.attempt('e_b_old', '00000000-0000-0000-0000-000001950061', pg_temp.fields());
insert into myk9_1950 values ('e_b_old_current', coalesce(public.ringside_claim_generation_current()::text, 'null'));
select pg_temp.as_passcode('judge', '00000000-0000-0000-0000-000001950021',
  (select value from myk9_1950 where step = 'a2_gen'));
select pg_temp.attempt('e_a_still', '00000000-0000-0000-0000-000001950063', pg_temp.fields());
insert into myk9_1950 values ('e_a_current', coalesce(public.ringside_claim_generation_current()::text, 'null'));
reset role;

do $$
declare
  v_out text;
begin
  select value into v_out from myk9_1950 where step = 'e_b_old';
  if v_out not like '42501|Passcode has been regenerated%' then
    raise exception 'FAIL E.6 B''s pre-regeneration session still writes: %', v_out;
  end if;
  if (select value from myk9_1950 where step = 'e_b_old_current') <> 'false' then
    raise exception 'FAIL E.7 B''s old generation must read as not current';
  end if;
  select value into v_out from myk9_1950 where step = 'e_a_still';
  if v_out <> 'ok' then raise exception 'FAIL E.8 A''s session was revoked by regenerating B: %', v_out; end if;
  if (select value from myk9_1950 where step = 'e_a_current') <> 'true' then
    raise exception 'FAIL E.9 A''s generation must still be current';
  end if;
  raise notice 'PASS E.6-E.9 only the regenerated code''s sessions are revoked';
end;
$$;

-- ===========================================================================
-- F. get_show_access_codes: a manager reads every judge code, with the judge's name.
-- ===========================================================================
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001950101');
do $$
declare
  v_names text[];
begin
  select array_agg(judge_display_name order by judge_display_name) into v_names
    from public.get_show_access_codes('00000000-0000-0000-0000-000001950031')
   where role = 'judge';
  insert into myk9_1950 values ('f_names', array_to_string(v_names, ','));
  insert into myk9_1950 values ('f_all_recoverable', (
    select bool_and(recoverable and passcode is not null)::text
      from public.get_show_access_codes('00000000-0000-0000-0000-000001950031')
     where role = 'judge'));
  insert into myk9_1950 values ('f_person_ids', (
    select count(*)::text
      from public.get_show_access_codes('00000000-0000-0000-0000-000001950031')
     where role = 'judge' and person_id is not null));
end;
$$;
-- An exhibitor-only account reads no judge code.
select pg_temp.as_account('00000000-0000-0000-0000-000001950102');
insert into myk9_1950 values ('f_stranger', (
  select count(*)::text from public.get_show_access_codes('00000000-0000-0000-0000-000001950031')
   where role = 'judge'));
reset role;

do $$
begin
  if (select value from myk9_1950 where step = 'f_names') <> 'Alice JudgeA,Bob JudgeB' then
    raise exception 'FAIL F.1 judge rows must name each judge, got %',
      (select value from myk9_1950 where step = 'f_names');
  end if;
  if (select value from myk9_1950 where step = 'f_all_recoverable') <> 'true'
     or (select value from myk9_1950 where step = 'f_person_ids') <> '2' then
    raise exception 'FAIL F.2 judge rows must be recoverable and carry person_id';
  end if;
  if (select value from myk9_1950 where step = 'f_stranger') <> '0' then
    raise exception 'FAIL F.3 a non-manager read judge codes';
  end if;
  raise notice 'PASS F get_show_access_codes returns every judge code to a manager, nothing to a stranger';
end;
$$;

-- G. A show-wide judge row (no person) cannot validate into a scoring claim: insert_show_passcodes
-- and regenerate_show_passcodes no longer create one, and the judge column they return is NULL.
set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001950101');
do $$
declare
  r record;
begin
  select * into strict r from public.regenerate_show_passcodes('00000000-0000-0000-0000-000001950031');
  if r.judge is not null or r.admin is null or r.steward is null or r.exhibitor is null then
    raise exception 'FAIL G.1 regenerate_show_passcodes row shape, got %', to_jsonb(r);
  end if;
end;
$$;
reset role;
do $$
begin
  if exists (select 1 from public.show_passcodes
              where show_id = '00000000-0000-0000-0000-000001950031'
                and role = 'judge' and person_id is null) then
    raise exception 'FAIL G.2 a show-wide judge code exists';
  end if;
  if (select count(*) from public.show_passcodes
       where show_id = '00000000-0000-0000-0000-000001950031' and role = 'judge') <> 2 then
    raise exception 'FAIL G.3 regenerate_show_passcodes must keep one code per judge';
  end if;
  if (select created_at::text from public.show_passcodes
       where show_id = '00000000-0000-0000-0000-000001950031'
         and person_id = '00000000-0000-0000-0000-000001950021')
     = (select value from myk9_1950 where step = 'a2_gen') then
    raise exception 'FAIL G.4 "regenerate all" must also replace every judge code';
  end if;
  raise notice 'PASS G regenerate_show_passcodes: no show-wide judge code, every judge code replaced';
end;
$$;


-- H. The wizard assigns judges BEFORE it asks for the show's passcodes: judge codes already exist,
-- and insert_show_passcodes must still succeed and leave them in place.
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000001950071', 'MYK9-1950 Wizard Show', 'AKC',
        current_date, current_date, '00000000-0000-0000-0000-000001950030', 'draft');
insert into public.trials (id, show_id, name, date)
values ('00000000-0000-0000-0000-000001950072', '00000000-0000-0000-0000-000001950071',
        'MYK9-1950 Wizard Trial', current_date);
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000001950073', '00000000-0000-0000-0000-000001950072',
        'Wizard Class', 'upcoming');
insert into public.judge_assignments (person_id, show_id, trial_id, class_id, status, confirmed_at)
values ('00000000-0000-0000-0000-000001950023', '00000000-0000-0000-0000-000001950071', NULL,
        '00000000-0000-0000-0000-000001950073', 'confirmed', now());
insert into myk9_1950
select 'wizard_judge_code_before', id::text from public.show_passcodes
 where show_id = '00000000-0000-0000-0000-000001950071' and person_id = '00000000-0000-0000-0000-000001950023';

set local role authenticated;
select pg_temp.as_account('00000000-0000-0000-0000-000001950101');
do $$
declare
  r record;
begin
  select * into strict r from public.insert_show_passcodes('00000000-0000-0000-0000-000001950071');
  if r.judge is not null or r.admin is null or r.steward is null or r.exhibitor is null then
    raise exception 'FAIL H.1 insert_show_passcodes row shape, got %', to_jsonb(r);
  end if;
end;
$$;
reset role;
do $$
begin
  if (select count(*) from public.show_passcodes
       where show_id = '00000000-0000-0000-0000-000001950071') <> 4 then
    raise exception 'FAIL H.2 expected admin, steward, exhibitor and one judge code, got %',
      (select count(*) from public.show_passcodes
        where show_id = '00000000-0000-0000-0000-000001950071');
  end if;
  if (select id from public.show_passcodes
       where show_id = '00000000-0000-0000-0000-000001950071'
         and person_id = '00000000-0000-0000-0000-000001950023') is distinct from (select value::uuid from myk9_1950 where step = 'wizard_judge_code_before') then
    raise exception 'FAIL H.3 insert_show_passcodes replaced the judge code';
  end if;
  raise notice 'PASS H insert_show_passcodes after judge assignment keeps the judge code';
end;
$$;

rollback;
