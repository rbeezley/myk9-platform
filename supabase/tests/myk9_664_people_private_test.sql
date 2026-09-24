-- MYK9-664: a handler's date of birth and junior handler numbers are readable only
-- by the person and site admins. Show managers can SET them (for a handler entered
-- in a show they manage) and see a derived per-entry junior flag, never the values.
-- Behavioral test for 20260924051700_myk9_664_people_private.sql.
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

-- Stored values, written as the owner (the fixture, not a code path under test).
insert into public.people_private (person_id, date_of_birth, junior_handler_numbers)
values
  ('00000000-0000-0000-0000-000000664014', date '1980-05-05', '{"AKC":"SELF-1"}'),
  ('00000000-0000-0000-0000-000000664016', date '1970-01-01', '{}'),
  ('00000000-0000-0000-0000-000000664017', date '2008-03-01', '{}'),
  ('00000000-0000-0000-0000-000000664018', date '2012-12-12', '{"AKC":"OUT-1"}');

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
select pg_temp.expect('the write RPC returns nothing',
  (select prorettype::regtype::text from pg_proc
    where oid = 'public.set_person_private_details(uuid, jsonb)'::regprocedure),
  'void');
select pg_temp.expect('secretary A sets a mail-in junior''s date of birth and AKC number',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664015',
       '{"date_of_birth":"2011-06-15","junior_handler_numbers":{"AKC":" J-15 "}}')$s$),
  '');
select pg_temp.expect('secretary A adds a UKC number without wiping the AKC one (merge)',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664015',
       '{"junior_handler_numbers":{"UKC":"U-15"}}')$s$),
  '');
select pg_temp.expect('the stored values are exactly what was set (checked as owner)',
  (select date_of_birth::text || ' ' || junior_handler_numbers::text
     from public.people_private where person_id = '00000000-0000-0000-0000-000000664015'),
  '2011-06-15 {"AKC": "J-15", "UKC": "U-15"}');
select pg_temp.expect('a blank number removes that key and nothing else',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664015',
       '{"junior_handler_numbers":{"UKC":""}}')$s$),
  '');
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
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664015',
       '{"junior_handler_numbers":{"FCI":"X"}}')$s$),
  'err:23514');
select pg_temp.expect('a future date of birth is refused',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664015',
       jsonb_build_object('date_of_birth', (current_date + 1)::text))$s$),
  'err:22023');
select pg_temp.expect('secretary A cannot set the values of someone entered nowhere',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664018',
       '{"date_of_birth":"2000-01-01"}')$s$),
  'err:42501');
select pg_temp.expect('the outsider''s stored date is untouched',
  (select date_of_birth::text from public.people_private
    where person_id = '00000000-0000-0000-0000-000000664018'),
  '2012-12-12');

-- ---------------------------------------------------------------------------
-- 3. Secretary A sees the derived flag, per entry, correctly.
-- ---------------------------------------------------------------------------
select pg_temp.expect('the flag function returns no date column',
  (select count(*)::text from pg_proc p, unnest(p.proallargtypes) t(typ)
    where p.oid = 'public.entry_handler_junior_flags(uuid[])'::regprocedure
      and t.typ = 'date'::regtype),
  '0');
select pg_temp.expect('secretary A: flags for every entry in the club''s shows',
  pg_temp.q('00000000-0000-0000-0000-000000664101',
    $s$select string_agg(right(entry_id::text, 3) || '=' || coalesce(is_junior::text, 'null'), ',' order by entry_id)
       from public.entry_handler_junior_flags(array[
         '00000000-0000-0000-0000-000000664031', '00000000-0000-0000-0000-000000664032',
         '00000000-0000-0000-0000-000000664033', '00000000-0000-0000-0000-000000664034',
         '00000000-0000-0000-0000-000000664035', '00000000-0000-0000-0000-000000664036']::uuid[])$s$),
  -- 031 self, 44 on the day: adult. 032 junior, 15: junior. 033 adult: adult.
  -- 034 boundary at an AKC trial (18 on the day): adult. 035 same person at a UKC
  -- trial (17 on January 1): junior. 036 no date of birth: unknown.
  '031=false,032=true,033=false,034=false,035=true,036=null');

-- ---------------------------------------------------------------------------
-- 4. A secretary of another club gets no flag and no write.
-- ---------------------------------------------------------------------------
select pg_temp.expect('positive control: secretary B gets the flag machinery for their own show (no rows, no error)',
  pg_temp.q('00000000-0000-0000-0000-000000664102',
    $s$select count(*) from public.entry_handler_junior_flags(array[]::uuid[])$s$),
  '0');
select pg_temp.expect('secretary B gets no flag for show A''s entries',
  pg_temp.q('00000000-0000-0000-0000-000000664102',
    $s$select count(*) from public.entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664032', '00000000-0000-0000-0000-000000664034']::uuid[])$s$),
  '0');
select pg_temp.expect('secretary B cannot set the values of show A''s entrant',
  pg_temp.q('00000000-0000-0000-0000-000000664102',
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664015',
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
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664014',
       '{"date_of_birth":"1981-05-05"}')$s$),
  '');
select pg_temp.expect('the person can clear their own date of birth',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664014',
       '{"date_of_birth":null}')$s$),
  '');
select pg_temp.expect('after clearing, the date is null and the number survives',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select coalesce(date_of_birth::text, 'null') || ' ' || (junior_handler_numbers ->> 'AKC')
       from public.people_private where person_id = '00000000-0000-0000-0000-000000664014'$s$),
  'null SELF-1');
select pg_temp.expect('the person cannot set someone else''s values',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664016',
       '{"date_of_birth":"2015-01-01"}')$s$),
  'err:42501');
select pg_temp.expect('an exhibitor gets no flag for entries they do not manage',
  pg_temp.q('00000000-0000-0000-0000-000000664104',
    $s$select count(*) from public.entry_handler_junior_flags(array[
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
    $s$select public.set_person_private_details('00000000-0000-0000-0000-000000664015',
       '{"date_of_birth":"1990-01-01"}')$s$),
  'err:42501');
select pg_temp.expect('anon cannot call the flag RPC',
  pg_temp.q(null,
    $s$select count(*) from public.entry_handler_junior_flags(array[
       '00000000-0000-0000-0000-000000664032']::uuid[])$s$),
  'err:42501');
select pg_temp.expect('anon cannot call the pure helper either',
  pg_temp.q(null, $s$select public.handler_is_junior(date '2010-01-01', date '2026-01-01', 'AKC')$s$),
  'err:42501');

rollback;
