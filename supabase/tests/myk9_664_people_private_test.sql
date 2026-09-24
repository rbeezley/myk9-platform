-- MYK9-664: a handler's date of birth and junior handler numbers are readable only
-- by the person and site admins. Show managers can SET them (for a handler entered
-- in a show they manage) and read the junior flag each entry recorded, never the values.
-- Behavioral test for 20260924231700_myk9_664_people_private.sql.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- Fixture pattern from myk9_710_people_identity_guard_test.sql: `people` rows are
-- seeded BEFORE their `auth.users` rows so the signup trigger ADOPTS them, and the
-- auth rows are real because the email invariant trigger reads them. Fake auth ids
-- make that trigger abort the fixture before any assertion runs.
--
-- Every refusal is paired with a positive control on the same caller, so a refusal
-- proves the guard, not an empty fixture.

begin;

create function pg_temp.expect(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: expected %, got %', label, want, got;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0. The values are no longer on `people` at all. Every people reader a manager
--    can reach (table SELECT, embeds, definer functions returning people rows)
--    therefore cannot carry them. This is the assertion that is RED on the
--    pre-MYK9-664 schema.
-- ---------------------------------------------------------------------------
select pg_temp.expect('people carries no date_of_birth or junior_handler_numbers column',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'people'
      and column_name in ('date_of_birth', 'junior_handler_numbers')),
  '0');

-- ---------------------------------------------------------------------------
-- Fixtures.
--   Club A: AKC show A (trial 2026-10-10) and UKC show U (trial 2026-10-10).
--   Club B: AKC show B. Its secretary manages nothing in club A.
-- ---------------------------------------------------------------------------
insert into public.clubs (id, name)
values
  ('00000000-0000-0000-0000-000000664001', 'MYK9-664 Club A'),
  ('00000000-0000-0000-0000-000000664901', 'MYK9-664 Club B');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values
  ('00000000-0000-0000-0000-000000664002', 'MYK9-664 Show A', 'AKC',
   date '2026-10-10', date '2026-10-10', '00000000-0000-0000-0000-000000664001', 'published'),
  ('00000000-0000-0000-0000-000000664802', 'MYK9-664 Show U', 'UKC',
   date '2026-10-10', date '2026-10-10', '00000000-0000-0000-0000-000000664001', 'published'),
  ('00000000-0000-0000-0000-000000664902', 'MYK9-664 Show B', 'AKC',
   date '2026-10-10', date '2026-10-10', '00000000-0000-0000-0000-000000664901', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values
  ('00000000-0000-0000-0000-000000664003', '00000000-0000-0000-0000-000000664002',
   'MYK9-664 Trial A', date '2026-10-10', 'AKC'),
  ('00000000-0000-0000-0000-000000664803', '00000000-0000-0000-0000-000000664802',
   'MYK9-664 Trial U', date '2026-10-10', 'UKC'),
  ('00000000-0000-0000-0000-000000664903', '00000000-0000-0000-0000-000000664902',
   'MYK9-664 Trial B', date '2026-10-10', 'AKC');
insert into public.classes (id, trial_id, name, status)
values
  ('00000000-0000-0000-0000-000000664004', '00000000-0000-0000-0000-000000664003',
   'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000664804', '00000000-0000-0000-0000-000000664803',
   'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000664904', '00000000-0000-0000-0000-000000664903',
   'Container Novice', 'upcoming');

-- 011 secretary A, 012 secretary B, 013 site admin, 014 self (signs in, entered in A),
-- 015 mail-in junior (15 on the trial date), 016 mail-in adult,
-- 017 mail-in boundary (turns 18 on 2026-03-01: adult for AKC on 2026-10-10,
--     still junior for UKC, which measures on January 1),
-- 018 outsider (entered in no show), 019 mail-in with no date of birth.
insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000000664011', 'MYK9-664', 'SecretaryA', 'myk9-664-sec-a@example.test'),
  ('00000000-0000-0000-0000-000000664012', 'MYK9-664', 'SecretaryB', 'myk9-664-sec-b@example.test'),
  ('00000000-0000-0000-0000-000000664013', 'MYK9-664', 'Admin', 'myk9-664-admin@example.test'),
  ('00000000-0000-0000-0000-000000664014', 'MYK9-664', 'Self', 'myk9-664-self@example.test'),
  ('00000000-0000-0000-0000-000000664015', 'MYK9-664', 'Junior', null),
  ('00000000-0000-0000-0000-000000664016', 'MYK9-664', 'Adult', null),
  ('00000000-0000-0000-0000-000000664017', 'MYK9-664', 'Boundary', null),
  ('00000000-0000-0000-0000-000000664018', 'MYK9-664', 'Outsider', null),
  ('00000000-0000-0000-0000-000000664019', 'MYK9-664', 'NoBirthday', null);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000664101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-664-sec-a@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000664102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-664-sec-b@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000664103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-664-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000664104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-664-self@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select person_id, r.id, club_id, true, auth_id
from public.roles r,
  (values
    ('00000000-0000-0000-0000-000000664011'::uuid, '00000000-0000-0000-0000-000000664001'::uuid,
     '00000000-0000-0000-0000-000000664101'::uuid),
    ('00000000-0000-0000-0000-000000664012'::uuid, '00000000-0000-0000-0000-000000664901'::uuid,
     '00000000-0000-0000-0000-000000664102'::uuid)
  ) as secs(person_id, club_id, auth_id)
where r.name = 'secretary';
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000664013', id, true, '00000000-0000-0000-0000-000000664103'
from public.roles where name = 'site_admin';

-- Every entrant owns their own dog; the handler of each entry is the person under test.
insert into public.dogs (id, name, call_name, breed, owner_id)
values
  ('00000000-0000-0000-0000-000000664021', 'MYK9-664 Dog Self', 'Self', 'Beagle', '00000000-0000-0000-0000-000000664014'),
  ('00000000-0000-0000-0000-000000664022', 'MYK9-664 Dog Junior', 'Junior', 'Beagle', '00000000-0000-0000-0000-000000664015'),
  ('00000000-0000-0000-0000-000000664023', 'MYK9-664 Dog Adult', 'Adult', 'Beagle', '00000000-0000-0000-0000-000000664016'),
  ('00000000-0000-0000-0000-000000664024', 'MYK9-664 Dog Boundary', 'Boundary', 'Beagle', '00000000-0000-0000-0000-000000664017'),
  ('00000000-0000-0000-0000-000000664025', 'MYK9-664 Dog NoBirthday', 'NoBday', 'Beagle', '00000000-0000-0000-0000-000000664019');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values
  ('00000000-0000-0000-0000-000000664021', 'AKC (American Kennel Club)', 'SR664021', true),
  ('00000000-0000-0000-0000-000000664022', 'AKC (American Kennel Club)', 'SR664022', true),
  ('00000000-0000-0000-0000-000000664023', 'AKC (American Kennel Club)', 'SR664023', true),
  ('00000000-0000-0000-0000-000000664024', 'AKC (American Kennel Club)', 'SR664024', true),
  ('00000000-0000-0000-0000-000000664025', 'AKC (American Kennel Club)', 'SR664025', true);
-- The boundary handler's dog is also entered at the UKC show, which requires a UKC number.
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values ('00000000-0000-0000-0000-000000664024', 'UKC (United Kennel Club)', 'UKC664024', false);

-- Stored values, written as the owner (the fixture, not a code path under test).
-- Written BEFORE the entries, so each entry records its junior flag at creation
-- (section 3) from these dates, independent of today's date.
insert into public.people_private (person_id, date_of_birth, junior_handler_numbers)
values
  ('00000000-0000-0000-0000-000000664014', date '1980-05-05', '{"AKC":"SELF-1"}'),
  ('00000000-0000-0000-0000-000000664015', date '2011-06-14', '{}'),
  ('00000000-0000-0000-0000-000000664016', date '1970-01-01', '{}'),
  ('00000000-0000-0000-0000-000000664017', date '2008-03-01', '{}'),
  ('00000000-0000-0000-0000-000000664018', date '2012-12-12', '{"AKC":"OUT-1"}');

-- 031 self @A, 032 junior @A, 033 adult @A, 034 boundary @A (AKC),
-- 035 boundary @U (UKC), 036 no-birthday @A, 037 junior @U (for the "other show" pair).
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values
  ('00000000-0000-0000-0000-000000664031', '00000000-0000-0000-0000-000000664021', '00000000-0000-0000-0000-000000664004',
   '00000000-0000-0000-0000-000000664002', '00000000-0000-0000-0000-000000664003', 'MYK9-664 Self',
   '00000000-0000-0000-0000-000000664014', 'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000664032', '00000000-0000-0000-0000-000000664022', '00000000-0000-0000-0000-000000664004',
   '00000000-0000-0000-0000-000000664002', '00000000-0000-0000-0000-000000664003', 'MYK9-664 Junior',
   '00000000-0000-0000-0000-000000664015', 'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000664033', '00000000-0000-0000-0000-000000664023', '00000000-0000-0000-0000-000000664004',
   '00000000-0000-0000-0000-000000664002', '00000000-0000-0000-0000-000000664003', 'MYK9-664 Adult',
   '00000000-0000-0000-0000-000000664016', 'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000664034', '00000000-0000-0000-0000-000000664024', '00000000-0000-0000-0000-000000664004',
   '00000000-0000-0000-0000-000000664002', '00000000-0000-0000-0000-000000664003', 'MYK9-664 Boundary',
   '00000000-0000-0000-0000-000000664017', 'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000664035', '00000000-0000-0000-0000-000000664024', '00000000-0000-0000-0000-000000664804',
   '00000000-0000-0000-0000-000000664802', '00000000-0000-0000-0000-000000664803', 'MYK9-664 Boundary',
   '00000000-0000-0000-0000-000000664017', 'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000664036', '00000000-0000-0000-0000-000000664025', '00000000-0000-0000-0000-000000664004',
   '00000000-0000-0000-0000-000000664002', '00000000-0000-0000-0000-000000664003', 'MYK9-664 NoBirthday',
   '00000000-0000-0000-0000-000000664019', 'confirmed', 'pending', 25, 'no-status');


do $$
begin
  if (select count(*) from public.people
       where id in ('00000000-0000-0000-0000-000000664011', '00000000-0000-0000-0000-000000664012',
                    '00000000-0000-0000-0000-000000664013', '00000000-0000-0000-0000-000000664014')
         and auth_user_id is not null) <> 4 then
    raise exception 'FAIL fixture: seeded people were not adopted at signup';
  end if;
end;
$$;

-- Runs one statement as `caller` (NULL = anon) through the role/claims PostgREST
-- sets. Returns the statement's single scalar result as text, 'ok' for a statement
-- with no result, or the SQLSTATE it failed with prefixed 'err:'.
create function pg_temp.q(caller uuid, stmt text)
returns text language plpgsql as $$
declare
  v_result text;
begin
  if caller is null then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claim.sub', caller::text, true);
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
  begin
    execute stmt into v_result;
    v_result := coalesce(v_result, 'null');
  exception when others then
    v_result := 'err:' || sqlstate;
  end;
  reset role;
  return v_result;
end;
$$;

-- Callers.
--   A  = 664101 secretary of club A      B = 664102 secretary of club B
--   AD = 664103 site admin               S = 664104 the person 014 themself

-- ---------------------------------------------------------------------------
-- 1. Secretary A cannot read the values, of an entrant or of anyone.
-- ---------------------------------------------------------------------------
select pg_temp.expect('positive control: secretary A can read the entrant''s people row',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select count(*) from public.people where id = '00000000-0000-0000-0000-000000664017'$s$),
  '1');
select pg_temp.expect('secretary A reads no people_private row of an entrant in show A',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select count(*) from public.people_private where person_id = '00000000-0000-0000-0000-000000664017'$s$),
  '0');
select pg_temp.expect('secretary A reads no people_private row of anyone',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select count(*) from public.people_private$s$),
  '0');
select pg_temp.expect('secretary A cannot write people_private directly',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$update public.people_private set date_of_birth = date '2000-01-01'
       where person_id = '00000000-0000-0000-0000-000000664017'$s$),
  'err:42501');
select pg_temp.expect('secretary A cannot insert into people_private directly',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$insert into public.people_private (person_id, date_of_birth)
       values ('00000000-0000-0000-0000-000000664015', date '2011-01-01')$s$),
  'err:42501');

-- ---------------------------------------------------------------------------
-- 2. Secretary A CAN set them for a mail-in handler entered in show A, write-only.
-- ---------------------------------------------------------------------------
select pg_temp.expect('the save RPC returns the people row, which carries no private value',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select (r ? 'first_name')::text || ' ' || (r ? 'date_of_birth')::text
         || ' ' || (r ? 'junior_handler_numbers')::text
       from public.update_person_details('00000000-0000-0000-0000-000000664015', '{}',
         '{"date_of_birth":"2011-06-14"}') as r$s$),
  'true false false');
select pg_temp.expect('secretary A sets a mail-in junior''s date of birth and AKC number',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664015', '{}',
       '{"date_of_birth":"2011-06-15","junior_handler_numbers":{"AKC":" J-15 "}}') is not null$s$),
  'true');
select pg_temp.expect('secretary A adds a UKC number without wiping the AKC one (merge)',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664015', '{}',
       '{"junior_handler_numbers":{"UKC":"U-15"}}') is not null$s$),
  'true');
select pg_temp.expect('the stored values are exactly what was set (checked as owner)',
  (select date_of_birth::text || ' ' || junior_handler_numbers::text
     from public.people_private where person_id = '00000000-0000-0000-0000-000000664015'),
  '2011-06-15 {"AKC": "J-15", "UKC": "U-15"}');
select pg_temp.expect('a blank number removes that key and nothing else',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664015', '{}',
       '{"junior_handler_numbers":{"UKC":""}}') is not null$s$),
  'true');
select pg_temp.expect('after removal only AKC remains and the date is untouched',
  (select date_of_birth::text || ' ' || junior_handler_numbers::text
     from public.people_private where person_id = '00000000-0000-0000-0000-000000664015'),
  '2011-06-15 {"AKC": "J-15"}');
select pg_temp.expect('having set it, secretary A still cannot read it back',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select count(*) from public.people_private where person_id = '00000000-0000-0000-0000-000000664015'$s$),
  '0');
select pg_temp.expect('an unregistered registry key is refused by the CHECK',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664015', '{}',
       '{"junior_handler_numbers":{"FCI":"X"}}')$s$),
  'err:23514');
select pg_temp.expect('a future date of birth is refused',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664015', '{}',
       jsonb_build_object('date_of_birth', (current_date + 1)::text))$s$),
  'err:22023');
select pg_temp.expect('secretary A cannot set the values of someone entered nowhere',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664018', '{}',
       '{"date_of_birth":"2000-01-01"}')$s$),
  'err:42501');
select pg_temp.expect('the outsider''s stored date is untouched',
  (select date_of_birth::text from public.people_private
    where person_id = '00000000-0000-0000-0000-000000664018'),
  '2012-12-12');

-- ---------------------------------------------------------------------------
-- 3. Secretary A reads the junior flag each entry RECORDED at creation. Nothing
--    derives it from the date of birth on a manager's request: a manager who can
--    edit a trial's date and re-ask could bisect the handler's 18th birthday.
-- ---------------------------------------------------------------------------
select pg_temp.expect('the live-derivation function entry_handler_junior_flags is gone',
  (select count(*)::text from pg_proc where proname = 'entry_handler_junior_flags'),
  '0');
select pg_temp.expect('no API-callable function takes a date of birth to answer "junior?"',
  (select count(*)::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and 'date'::regtype = any (p.proargtypes::oid[]::regtype[])
      and p.proname like '%junior%'),
  '0');
select pg_temp.expect('the recorded-flag read returns no date column',
  (select count(*)::text from pg_proc p, unnest(p.proallargtypes) t(typ)
    where p.oid = 'public.recorded_entry_handler_junior_flags(uuid[])'::regprocedure
      and t.typ = 'date'::regtype),
  '0');
select pg_temp.expect('secretary A cannot read entries.handler_is_junior directly (no column grant)',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select count(handler_is_junior) from public.entries
       where id = '00000000-0000-0000-0000-000000664032'$s$),
  'err:42501');
select pg_temp.expect('secretary A: recorded flags for every entry in the club''s shows',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select string_agg(right(entry_id::text, 3) || '=' || coalesce(is_junior::text, 'null'), ',' order by entry_id)
       from public.recorded_entry_handler_junior_flags(array[
         '00000000-0000-0000-0000-000000664031', '00000000-0000-0000-0000-000000664032',
         '00000000-0000-0000-0000-000000664033', '00000000-0000-0000-0000-000000664034',
         '00000000-0000-0000-0000-000000664035', '00000000-0000-0000-0000-000000664036']::uuid[])$s$),
  -- 031 self, 46 on the day: adult. 032 junior, 15: junior. 033 adult: adult.
  -- 034 boundary at an AKC trial (18 on the day): adult. 035 same person at a UKC
  -- trial (17 on January 1): junior. 036 no date of birth: unknown.
  '031=false,032=true,033=false,034=false,035=true,036=null');

-- ---------------------------------------------------------------------------
-- 4. A secretary of another club gets no flag and no write.
-- ---------------------------------------------------------------------------
select pg_temp.expect('positive control: secretary B gets the flag machinery for their own show (no rows, no error)',
  pg_temp.q('00000000-0000-0000-0000-000000664102',
    $s$select count(*) from public.recorded_entry_handler_junior_flags(array[]::uuid[])$s$),
  '0');
select pg_temp.expect('secretary B gets no flag for show A''s entries',
  pg_temp.q('00000000-0000-0000-0000-000000664102',
    $s$select count(*) from public.recorded_entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664032', '00000000-0000-0000-0000-000000664034']::uuid[])$s$),
  '0');
select pg_temp.expect('secretary B cannot set the values of show A''s entrant',
  pg_temp.q('00000000-0000-0000-0000-000000664102',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664015', '{}',
       '{"date_of_birth":"1990-01-01"}')$s$),
  'err:42501');
select pg_temp.expect('secretary B reads no people_private row',
  pg_temp.q('00000000-0000-0000-0000-000000664102',
    $s$select count(*) from public.people_private$s$),
  '0');

-- ---------------------------------------------------------------------------
-- 5. The person reads their own values, and only their own.
-- ---------------------------------------------------------------------------
select pg_temp.expect('the person reads their own date of birth and number',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select date_of_birth::text || ' ' || (junior_handler_numbers ->> 'AKC')
       from public.people_private where person_id = '00000000-0000-0000-0000-000000664014'$s$),
  '1980-05-05 SELF-1');
select pg_temp.expect('the person reads no one else''s row',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select count(*) from public.people_private
       where person_id <> '00000000-0000-0000-0000-000000664014'$s$),
  '0');
select pg_temp.expect('the person can set their own values',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664014', '{}',
       '{"date_of_birth":"1981-05-05"}') is not null$s$),
  'true');
select pg_temp.expect('the person can clear their own date of birth',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664014', '{}',
       '{"date_of_birth":null}') is not null$s$),
  'true');
select pg_temp.expect('after clearing, the date is null and the number survives',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select coalesce(date_of_birth::text, 'null') || ' ' || (junior_handler_numbers ->> 'AKC')
       from public.people_private where person_id = '00000000-0000-0000-0000-000000664014'$s$),
  'null SELF-1');
select pg_temp.expect('the person cannot set someone else''s values',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016', '{}',
       '{"date_of_birth":"2015-01-01"}')$s$),
  'err:42501');
select pg_temp.expect('an exhibitor gets no flag for entries they do not manage',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select count(*) from public.recorded_entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664031', '00000000-0000-0000-0000-000000664032']::uuid[])$s$),
  '0');

-- ---------------------------------------------------------------------------
-- 6. A site admin reads everything.
-- ---------------------------------------------------------------------------
select pg_temp.expect('site admin reads every people_private row',
  pg_temp.q('00000000-0000-0000-0000-000000664103',
    $s$select count(*) from public.people_private
       where person_id in ('00000000-0000-0000-0000-000000664014', '00000000-0000-0000-0000-000000664015',
         '00000000-0000-0000-0000-000000664016', '00000000-0000-0000-0000-000000664017',
         '00000000-0000-0000-0000-000000664018')$s$),
  '5');
select pg_temp.expect('site admin reads a mail-in junior''s date of birth',
  pg_temp.q('00000000-0000-0000-0000-000000664103',
    $s$select date_of_birth::text from public.people_private
       where person_id = '00000000-0000-0000-0000-000000664015'$s$),
  '2011-06-15');

-- ---------------------------------------------------------------------------
-- 7. anon gets nothing.
-- ---------------------------------------------------------------------------
select pg_temp.expect('anon cannot select people_private',
  pg_temp.q(null, $s$select count(*) from public.people_private$s$),
  'err:42501');
select pg_temp.expect('anon cannot call the write RPC',
  pg_temp.q(null,
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664015', '{}',
       '{"date_of_birth":"1990-01-01"}')$s$),
  'err:42501');
select pg_temp.expect('anon cannot call the flag RPC',
  pg_temp.q(null,
    $s$select count(*) from public.recorded_entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664032']::uuid[])$s$),
  'err:42501');
select pg_temp.expect('anon cannot call the site-admin recompute RPC',
  pg_temp.q(null,
    $s$select public.recompute_entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664032']::uuid[])$s$),
  'err:42501');
select pg_temp.expect('anon cannot call the pure helper either',
  pg_temp.q(null, $s$select private.handler_is_junior_at(date '2010-01-01', date '2026-01-01', 'AKC')$s$),
  'err:42501');
select pg_temp.expect('authenticated cannot call the pure helper either',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select private.handler_is_junior_at(date '2010-01-01', date '2026-01-01', 'AKC')$s$),
  'err:42501');

-- ---------------------------------------------------------------------------
-- 8. The save is ONE atomic call: people columns and private details together.
-- ---------------------------------------------------------------------------
select pg_temp.expect('secretary B''s combined save on show A''s entrant is refused',
  pg_temp.q('00000000-0000-0000-0000-000000664102',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016',
       '{"phone":"555-0000"}', '{"date_of_birth":"1970-02-02"}') is not null$s$),
  'err:42501');
select pg_temp.expect('...and leaves the people row unchanged',
  (select coalesce(phone, 'null') from public.people where id = '00000000-0000-0000-0000-000000664016'),
  'null');
select pg_temp.expect('secretary A''s combined save updates both parts',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016',
       '{"phone":"555-0101","city":"Topeka"}', '{"date_of_birth":"1970-03-03"}') is not null$s$),
  'true');
select pg_temp.expect('both parts landed (checked as owner)',
  (select p.phone || ' ' || p.city || ' ' || pp.date_of_birth::text
     from public.people p join public.people_private pp on pp.person_id = p.id
    where p.id = '00000000-0000-0000-0000-000000664016'),
  '555-0101 Topeka 1970-03-03');
select pg_temp.expect('a combined save whose PRIVATE part fails writes nothing',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016',
       '{"phone":"555-0202"}', '{"junior_handler_numbers":{"FCI":"X"}}') is not null$s$),
  'err:23514');
select pg_temp.expect('...the phone from that failed save did not stick',
  (select phone from public.people where id = '00000000-0000-0000-0000-000000664016'),
  '555-0101');
select pg_temp.expect('the require-unlinked race on a linked row updates nothing and says so',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664014',
       '{"phone":"555-0303"}', '{"date_of_birth":"1990-09-09"}', true)::text$s$),
  'null');
select pg_temp.expect('...neither the phone nor the date moved',
  (select coalesce(p.phone, 'null') || ' ' || coalesce(pp.date_of_birth::text, 'null')
     from public.people p left join public.people_private pp on pp.person_id = p.id
    where p.id = '00000000-0000-0000-0000-000000664014'),
  'null null');
select pg_temp.expect('positive control: the same save without the race flag goes through',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664014',
       '{"phone":"555-0303"}', '{}') is not null$s$),
  'true');
select pg_temp.expect('status is not a column this function changes',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016',
       '{"status":"suspended"}', '{}') is not null$s$),
  'err:22023');
select pg_temp.expect('auth_user_id is not a column this function changes',
  pg_temp.q('00000000-0000-0000-0000-000000664103',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016',
       '{"auth_user_id":"00000000-0000-0000-0000-000000664103"}', '{}') is not null$s$),
  'err:22023');
select pg_temp.expect('deleted_at is not a column this function changes',
  pg_temp.q('00000000-0000-0000-0000-000000664103',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016',
       jsonb_build_object('deleted_at', now()), '{}') is not null$s$),
  'err:22023');
select pg_temp.expect('an unknown key is refused, not dropped',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016',
       '{"bio":"hello"}', '{}') is not null$s$),
  'err:22023');
select pg_temp.expect('the refused keys changed nothing',
  (select status || ' ' || coalesce(auth_user_id::text, 'null') || ' ' || coalesce(deleted_at::text, 'null')
     from public.people where id = '00000000-0000-0000-0000-000000664016'),
  'active null null');
select pg_temp.expect('MYK9-710 guard still fires inside the definer: no email change on a linked person',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664014',
       '{"email":"attacker@example.test"}', '{}') is not null$s$),
  'err:42501');
-- Since MYK9-710 option C an entered person's email is site-admin-only, so the
-- positive control for the email path is a site admin through the same function.
select pg_temp.expect('positive control: a site admin can set a mail-in person''s email here',
  pg_temp.q('00000000-0000-0000-0000-000000664103',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016',
       '{"email":"myk9-664-adult@example.test"}', '{}') is not null$s$),
  'true');
select pg_temp.expect('anon cannot call the save RPC',
  pg_temp.q(null,
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664016',
       '{"phone":"1"}', '{}') is not null$s$),
  'err:42501');

-- ---------------------------------------------------------------------------
-- 9. The junior flag is RECORDED on the entry (Codex P1 on PR #2412).
--
-- A live "is this handler a junior at this trial?" answer leaks the date of
-- birth: a manager edits the trial date, asks again, and bisects the 18th
-- birthday. So the flag is written by one BEFORE trigger on `entries`, from the
-- date of birth and the trial as they stand when the entry is created, and is
-- recomputed only when the handler's date of birth is set or changed (for
-- entries not yet run) or by a site admin. A manager only ever reads it.
--
-- Dates here are relative to current_date, so this section does not rot:
--   Show Q / trial TQ in club A, trial date D = current_date + 60.
--   041 turns 18 ten days AFTER D   -> junior at D, adult if D moves 20 days later.
--   045 is 40                       -> adult.
--   046 has no date of birth        -> unknown.
--   Trial TP (club A, show P) ran 10 days ago, for the "not yet run" rule.
-- ---------------------------------------------------------------------------
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values
  ('00000000-0000-0000-0000-000000664042', 'MYK9-664 Show Q', 'AKC',
   current_date + 60, current_date + 90, '00000000-0000-0000-0000-000000664001', 'published'),
  ('00000000-0000-0000-0000-000000664052', 'MYK9-664 Show P', 'AKC',
   current_date - 10, current_date - 10, '00000000-0000-0000-0000-000000664001', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values
  ('00000000-0000-0000-0000-000000664043', '00000000-0000-0000-0000-000000664042',
   'MYK9-664 Trial Q', current_date + 60, 'AKC'),
  ('00000000-0000-0000-0000-000000664053', '00000000-0000-0000-0000-000000664052',
   'MYK9-664 Trial P', current_date - 10, 'AKC');
insert into public.classes (id, trial_id, name, status)
values
  ('00000000-0000-0000-0000-000000664044', '00000000-0000-0000-0000-000000664043',
   'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000664054', '00000000-0000-0000-0000-000000664053',
   'Container Novice', 'upcoming');
insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000000664041', 'MYK9-664', 'NearlyEighteen', null),
  ('00000000-0000-0000-0000-000000664045', 'MYK9-664', 'Forty', null),
  ('00000000-0000-0000-0000-000000664046', 'MYK9-664', 'Undated', null);
insert into public.people_private (person_id, date_of_birth)
values
  ('00000000-0000-0000-0000-000000664041',
   (current_date + 60 - interval '18 years' + interval '10 days')::date),
  ('00000000-0000-0000-0000-000000664045', (current_date - interval '40 years')::date);
insert into public.dogs (id, name, call_name, breed, owner_id)
values
  ('00000000-0000-0000-0000-000000664061', 'MYK9-664 Dog Nearly', 'Nearly', 'Beagle', '00000000-0000-0000-0000-000000664041'),
  ('00000000-0000-0000-0000-000000664062', 'MYK9-664 Dog Forty', 'Forty', 'Beagle', '00000000-0000-0000-0000-000000664045'),
  ('00000000-0000-0000-0000-000000664063', 'MYK9-664 Dog Undated', 'Undated', 'Beagle', '00000000-0000-0000-0000-000000664046');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values
  ('00000000-0000-0000-0000-000000664061', 'AKC (American Kennel Club)', 'SR664061', true),
  ('00000000-0000-0000-0000-000000664062', 'AKC (American Kennel Club)', 'SR664062', true),
  ('00000000-0000-0000-0000-000000664063', 'AKC (American Kennel Club)', 'SR664063', true);

-- The past-trial entry is fixture (as owner): it exists before anything under test.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values
  ('00000000-0000-0000-0000-000000664074', '00000000-0000-0000-0000-000000664063', '00000000-0000-0000-0000-000000664054',
   '00000000-0000-0000-0000-000000664052', '00000000-0000-0000-0000-000000664053', 'MYK9-664 Undated',
   '00000000-0000-0000-0000-000000664046', 'confirmed', 'pending', 25, 'no-status');

-- 9a. Secretary A creates the entries the way secretary manual entry does: a
--     direct insert as `authenticated`. The adult's insert claims junior = true;
--     the caller's value is ignored.
select pg_temp.expect('secretary A creates three entries at trial Q',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$with ins as (
         insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
           entry_status, payment_status, entry_fee, check_in_status, handler_is_junior)
         values
           ('00000000-0000-0000-0000-000000664071', '00000000-0000-0000-0000-000000664061',
            '00000000-0000-0000-0000-000000664044', '00000000-0000-0000-0000-000000664042',
            '00000000-0000-0000-0000-000000664043', 'MYK9-664 NearlyEighteen',
            '00000000-0000-0000-0000-000000664041', 'confirmed', 'pending', 25, 'no-status', null),
           ('00000000-0000-0000-0000-000000664072', '00000000-0000-0000-0000-000000664062',
            '00000000-0000-0000-0000-000000664044', '00000000-0000-0000-0000-000000664042',
            '00000000-0000-0000-0000-000000664043', 'MYK9-664 Forty',
            '00000000-0000-0000-0000-000000664045', 'confirmed', 'pending', 25, 'no-status', true),
           ('00000000-0000-0000-0000-000000664073', '00000000-0000-0000-0000-000000664063',
            '00000000-0000-0000-0000-000000664044', '00000000-0000-0000-0000-000000664042',
            '00000000-0000-0000-0000-000000664043', 'MYK9-664 Undated',
            '00000000-0000-0000-0000-000000664046', 'confirmed', 'pending', 25, 'no-status', null)
         returning 1)
       select count(*) from ins$s$),
  '3');
select pg_temp.expect('created: under 18 = junior, 40 = adult (caller''s true ignored), no date = unknown',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select string_agg(right(entry_id::text, 3) || '=' || coalesce(is_junior::text, 'null'), ',' order by entry_id)
       from public.recorded_entry_handler_junior_flags(array[
         '00000000-0000-0000-0000-000000664071', '00000000-0000-0000-0000-000000664072',
         '00000000-0000-0000-0000-000000664073']::uuid[])$s$),
  '071=true,072=false,073=null');

-- 9b. The P1: a manager moves the trial date past the 18th birthday. Recomputed
--     live, 071 would now read adult; recorded, it does not move.
select pg_temp.expect('secretary A moves trial Q''s date 20 days later',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$with u as (update public.trials set date = current_date + 80
                  where id = '00000000-0000-0000-0000-000000664043' returning 1)
       select count(*) from u$s$),
  '1');
select pg_temp.expect('positive control: the trial date really moved (checked as owner)',
  (select (date - current_date)::text from public.trials
    where id = '00000000-0000-0000-0000-000000664043'),
  '80');
select pg_temp.expect('after the trial date edit the recorded flags are unchanged',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select string_agg(right(entry_id::text, 3) || '=' || coalesce(is_junior::text, 'null'), ',' order by entry_id)
       from public.recorded_entry_handler_junior_flags(array[
         '00000000-0000-0000-0000-000000664071', '00000000-0000-0000-0000-000000664072',
         '00000000-0000-0000-0000-000000664073']::uuid[])$s$),
  '071=true,072=false,073=null');
select pg_temp.expect('an unrelated entry update (run order) does not recompute either',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$with u as (update public.entries set run_order = 7
                  where id = '00000000-0000-0000-0000-000000664071' returning 1)
       select count(*) from u$s$),
  '1');
select pg_temp.expect('...071 is still recorded junior',
  (select coalesce(handler_is_junior::text, 'null') from public.entries
    where id = '00000000-0000-0000-0000-000000664071'),
  'true');

-- 9c. A manager cannot write the flag.
select pg_temp.expect('secretary A''s direct write of the flag is accepted as a statement...',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$with u as (update public.entries set handler_is_junior = false
                  where id = '00000000-0000-0000-0000-000000664071' returning 1)
       select count(*) from u$s$),
  '1');
select pg_temp.expect('...and ignored: 071 is still recorded junior',
  (select coalesce(handler_is_junior::text, 'null') from public.entries
    where id = '00000000-0000-0000-0000-000000664071'),
  'true');
select pg_temp.expect('changing an entry''s handler clears the flag rather than recomputing it',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$with u as (update public.entries set handler_id = '00000000-0000-0000-0000-000000664041'
                  where id = '00000000-0000-0000-0000-000000664072' returning 1)
       select count(*) from u$s$),
  '1');
select pg_temp.expect('...072 now reads unknown, not a fresh answer for the new handler',
  (select coalesce(handler_is_junior::text, 'null') from public.entries
    where id = '00000000-0000-0000-0000-000000664072'),
  'null');

-- 9d. Recomputing is a site-admin action.
select pg_temp.expect('secretary A cannot call the recompute RPC',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.recompute_entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664071']::uuid[])$s$),
  'err:42501');
select pg_temp.expect('an exhibitor cannot call the recompute RPC',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select public.recompute_entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664071']::uuid[])$s$),
  'err:42501');
select pg_temp.expect('...the refused recompute changed nothing',
  (select coalesce(handler_is_junior::text, 'null') from public.entries
    where id = '00000000-0000-0000-0000-000000664071'),
  'true');
select pg_temp.expect('positive control: the site admin''s recompute rewrites the one changed flag',
  pg_temp.q('00000000-0000-0000-0000-000000664103',
    $s$select public.recompute_entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664071', '00000000-0000-0000-0000-000000664073']::uuid[])$s$),
  '1');
select pg_temp.expect('...071 is now measured at the moved date: adult',
  (select coalesce(handler_is_junior::text, 'null') from public.entries
    where id = '00000000-0000-0000-0000-000000664071'),
  'false');

-- 9e. Setting the handler's date of birth records the flag on their entries that
--     have not run yet, and leaves the ones that have alone.
select pg_temp.expect('secretary A sets the undated handler''s date of birth (a 12-year-old)',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664046', '{}',
       jsonb_build_object('date_of_birth', (current_date - interval '12 years')::date::text)) is not null$s$),
  'true');
select pg_temp.expect('...the not-yet-run entry now records junior',
  (select coalesce(handler_is_junior::text, 'null') from public.entries
    where id = '00000000-0000-0000-0000-000000664073'),
  'true');
select pg_temp.expect('...the entry at the trial that already ran is untouched',
  (select coalesce(handler_is_junior::text, 'null') from public.entries
    where id = '00000000-0000-0000-0000-000000664074'),
  'null');
select pg_temp.expect('saving other details without the date of birth recomputes nothing',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.update_person_details('00000000-0000-0000-0000-000000664041',
       '{"city":"Salina"}', '{"junior_handler_numbers":{"AKC":"J-41"}}') is not null$s$),
  'true');
select pg_temp.expect('...071 keeps the site admin''s answer',
  (select coalesce(handler_is_junior::text, 'null') from public.entries
    where id = '00000000-0000-0000-0000-000000664071'),
  'false');
select pg_temp.expect('secretary B reads no recorded flag of show Q',
  pg_temp.q('00000000-0000-0000-0000-000000664102',
    $s$select count(*) from public.recorded_entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664071', '00000000-0000-0000-0000-000000664073']::uuid[])$s$),
  '0');

rollback;
