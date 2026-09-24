-- MYK9-710: a secretary must not be able to take over an account by unlinking
-- a manageable person's sign-in identity, rewriting their email, and signing up
-- at that address. Behavioral test for
-- 20260923154300_myk9_710_guard_people_identity_columns.sql.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- Fixture order matters: `people` rows are seeded BEFORE their `auth.users`
-- rows so the signup trigger ADOPTS them (see sign_in_email_invariant_test.sql),
-- and the auth rows are real, because the email invariant trigger reads them.
--
-- Each refusal is paired with a positive control on the SAME row and caller
-- (an unguarded column update that succeeds), so a refusal proves the guard
-- fired rather than RLS hiding the row.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000710001', 'MYK9-710 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000710002', 'MYK9-710 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000710001', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000710003', '00000000-0000-0000-0000-000000710002',
  'MYK9-710 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000710004', '00000000-0000-0000-0000-000000710003',
  'Container Novice', 'upcoming');

-- 011 secretary (attacker), 012 victim site admin, 013 a second site admin,
-- 014 mail-in exhibitor (never signs up here), 015 invited person holding a
-- pre-assigned secretary role but no identity yet, 016 mail-in exhibitor who
-- signs up later.
insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000000710011', 'MYK9-710', 'Secretary', 'myk9-710-secretary@example.test'),
  ('00000000-0000-0000-0000-000000710012', 'MYK9-710', 'Victim', 'myk9-710-victim@example.test'),
  ('00000000-0000-0000-0000-000000710013', 'MYK9-710', 'Admin', 'myk9-710-admin@example.test'),
  ('00000000-0000-0000-0000-000000710014', 'MYK9-710', 'Mailin', 'myk9-710-mailin@example.test'),
  ('00000000-0000-0000-0000-000000710015', 'MYK9-710', 'Invitee', 'myk9-710-invitee@example.test'),
  ('00000000-0000-0000-0000-000000710016', 'MYK9-710', 'Latecomer', 'myk9-710-latecomer@example.test');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000710101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-710-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000710102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-710-victim@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000710103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-710-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000710011', id,
  '00000000-0000-0000-0000-000000710001', true, '00000000-0000-0000-0000-000000710101'
from public.roles where name = 'secretary';
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select person_id, r.id, true, auth_id
from public.roles r,
  (values
    ('00000000-0000-0000-0000-000000710012'::uuid, '00000000-0000-0000-0000-000000710102'::uuid),
    ('00000000-0000-0000-0000-000000710013'::uuid, '00000000-0000-0000-0000-000000710103'::uuid)
  ) as admins(person_id, auth_id)
where r.name = 'site_admin';
-- The admin invite flow pre-assigns roles to a person with no identity yet.
insert into public.user_roles (user_id, role_id, club_id, is_active)
select '00000000-0000-0000-0000-000000710015', id,
  '00000000-0000-0000-0000-000000710001', true
from public.roles where name = 'secretary';

-- Step 1 of the attack, done as a fixture: entries in the secretary's show
-- name the victim and the invitee as handlers, which makes them manageable
-- people. The mail-in exhibitors own the dogs, which makes them manageable too.
insert into public.dogs (id, name, call_name, breed, owner_id)
values
  ('00000000-0000-0000-0000-000000710021', 'MYK9-710 Dog', 'Dog', 'Beagle',
   '00000000-0000-0000-0000-000000710014'),
  ('00000000-0000-0000-0000-000000710022', 'MYK9-710 Dog Two', 'Two', 'Beagle',
   '00000000-0000-0000-0000-000000710016'),
  ('00000000-0000-0000-0000-000000710023', 'MYK9-710 Dog Three', 'Three', 'Beagle',
   '00000000-0000-0000-0000-000000710014');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values
  ('00000000-0000-0000-0000-000000710021', 'AKC (American Kennel Club)', 'SR710021', true),
  ('00000000-0000-0000-0000-000000710022', 'AKC (American Kennel Club)', 'SR710022', true),
  ('00000000-0000-0000-0000-000000710023', 'AKC (American Kennel Club)', 'SR710023', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values
  ('00000000-0000-0000-0000-000000710031', '00000000-0000-0000-0000-000000710021',
   '00000000-0000-0000-0000-000000710004', '00000000-0000-0000-0000-000000710002',
   '00000000-0000-0000-0000-000000710003', 'MYK9-710 Victim',
   '00000000-0000-0000-0000-000000710012', 'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000710032', '00000000-0000-0000-0000-000000710022',
   '00000000-0000-0000-0000-000000710004', '00000000-0000-0000-0000-000000710002',
   '00000000-0000-0000-0000-000000710003', 'MYK9-710 Latecomer',
   '00000000-0000-0000-0000-000000710016', 'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000710033', '00000000-0000-0000-0000-000000710023',
   '00000000-0000-0000-0000-000000710004', '00000000-0000-0000-0000-000000710002',
   '00000000-0000-0000-0000-000000710003', 'MYK9-710 Invitee',
   '00000000-0000-0000-0000-000000710015', 'confirmed', 'pending', 25, 'no-status');

-- Runs one statement as `caller` through the same role/claims PostgREST sets.
-- Returns the SQLSTATE it failed with, or 'ok:<rows affected>'.
create function pg_temp.run_as(caller uuid, stmt text)
returns text language plpgsql as $$
declare
  v_rows bigint;
  v_state text;
begin
  perform set_config('request.jwt.claim.sub', caller::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    execute stmt;
    get diagnostics v_rows = row_count;
    v_state := 'ok:' || v_rows;
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  return v_state;
end;
$$;

create function pg_temp.expect(label text, got text, want text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: expected %, got %', label, want, got;
  end if;
  raise notice 'PASS %', label;
end;
$$;

-- Precondition: every seeded person with an auth row was adopted, not duplicated.
do $$
begin
  if (select count(*) from public.people
       where id in ('00000000-0000-0000-0000-000000710011',
                    '00000000-0000-0000-0000-000000710012',
                    '00000000-0000-0000-0000-000000710013')
         and auth_user_id is not null) <> 3 then
    raise exception 'FAIL fixture: seeded people were not adopted at signup';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attack, as the secretary.
-- ---------------------------------------------------------------------------

-- Positive control: RLS admits the victim's row to the secretary, so every
-- refusal below is the guard and not row visibility.
select pg_temp.expect('secretary can update an unguarded column on the victim row',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people set city = 'Anywhere' where id = '00000000-0000-0000-0000-000000710012'$s$),
  'ok:1');

-- Step 2a: unlink the victim's identity.
select pg_temp.expect('secretary cannot unlink a person''s auth_user_id',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people set auth_user_id = null where id = '00000000-0000-0000-0000-000000710012'$s$),
  '42501');

-- Unlink and rewrite in ONE statement: the early return in the email
-- invariant trigger must not let the pair through.
select pg_temp.expect('secretary cannot unlink and rewrite email in one statement',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people set auth_user_id = null, email = 'attacker@example.test'
       where id = '00000000-0000-0000-0000-000000710012'$s$),
  '42501');

-- Step 2b: change a linked person's email.
select pg_temp.expect('secretary cannot change a linked person''s email',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people set email = 'attacker@example.test' where id = '00000000-0000-0000-0000-000000710012'$s$),
  '42501');

-- Nor relink someone else's identity onto a row.
select pg_temp.expect('secretary cannot link an identity onto a person',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people set auth_user_id = '00000000-0000-0000-0000-000000710101'
       where id = '00000000-0000-0000-0000-000000710014'$s$),
  '42501');

-- The unlinked-but-role-holding row the invite flow creates: its email is the
-- adoption key for a secretary role, so it is guarded too.
select pg_temp.expect('secretary can update an unguarded column on the invited role holder',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people set city = 'Anywhere' where id = '00000000-0000-0000-0000-000000710015'$s$),
  'ok:1');
select pg_temp.expect('secretary cannot change the email of an unlinked role holder',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people set email = 'attacker@example.test' where id = '00000000-0000-0000-0000-000000710015'$s$),
  '42501');

-- Step 3: the attacker signs up at the address they tried to plant. Nothing
-- was planted, so this creates a fresh person and adopts no one.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values ('00000000-0000-0000-0000-000000710109', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'attacker@example.test', '', now(), now(), now(),
  '{}', '{}', false, false, false);

do $$
begin
  if (select auth_user_id from public.people where id = '00000000-0000-0000-0000-000000710012')
     is distinct from '00000000-0000-0000-0000-000000710102'::uuid then
    raise exception 'FAIL victim identity moved';
  end if;
  if (select email from public.people where id = '00000000-0000-0000-0000-000000710012')
     is distinct from 'myk9-710-victim@example.test' then
    raise exception 'FAIL victim email moved';
  end if;
  if (select auth_user_id from public.people where id = '00000000-0000-0000-0000-000000710015')
     is not null then
    raise exception 'FAIL attacker signup adopted the invited role holder';
  end if;
  if exists (
    select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where r.name in ('site_admin', 'secretary')
       and ur.auth_user_id = '00000000-0000-0000-0000-000000710109'
  ) then
    raise exception 'FAIL attacker signup received a privileged role';
  end if;
  if (select auth_user_id from public.user_roles ur
        join public.roles r on r.id = ur.role_id
       where ur.user_id = '00000000-0000-0000-0000-000000710012' and r.name = 'site_admin')
     is distinct from '00000000-0000-0000-0000-000000710102'::uuid then
    raise exception 'FAIL victim site_admin role no longer points at the victim';
  end if;
  raise notice 'PASS attacker signup adopted no one and received no privileged role';
end;
$$;

-- Regression pin for the EXISTING status guard (people_protect_status,
-- 20260524121000), which this migration deliberately leaves alone: a suspended
-- person who is not a manager of their own row cannot reinstate themselves.
-- Suspension and reinstatement run as a site admin, the path the app uses.
select pg_temp.expect('site admin can suspend the secretary',
  pg_temp.run_as('00000000-0000-0000-0000-000000710103',
    $s$update public.people set status = 'suspended' where id = '00000000-0000-0000-0000-000000710011'$s$),
  'ok:1');
select pg_temp.expect('a suspended person cannot reinstate themselves',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people set status = 'active' where id = '00000000-0000-0000-0000-000000710011'$s$),
  '42501');
select pg_temp.expect('site admin can reinstate the secretary',
  pg_temp.run_as('00000000-0000-0000-0000-000000710103',
    $s$update public.people set status = 'active' where id = '00000000-0000-0000-0000-000000710011'$s$),
  'ok:1');

-- ---------------------------------------------------------------------------
-- What must keep working.
-- ---------------------------------------------------------------------------

-- A secretary edits a mail-in person who never had a login: name and phone.
-- (Their email is frozen once they have entries: MYK9-710 option C, tested in
-- myk9_711_712_status_and_signup_grants_test.sql.)
select pg_temp.expect('secretary can edit a mail-in person''s name and phone',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people
          set first_name = 'Edited', phone = '555-0100'
        where id = '00000000-0000-0000-0000-000000710014'$s$),
  'ok:1');

-- An ordinary save that re-sends the SAME email (recased, padded) and the same
-- auth_user_id on a linked person is not a change.
select pg_temp.expect('re-saving an unchanged email and link on a linked person still works',
  pg_temp.run_as('00000000-0000-0000-0000-000000710101',
    $s$update public.people
          set email = '  MYK9-710-Victim@Example.TEST ', auth_user_id = auth_user_id,
              city = 'Resaved'
        where id = '00000000-0000-0000-0000-000000710012'$s$),
  'ok:1');

-- Mail-in adoption at signup: a mail-in exhibitor with entries signs up at the
-- address they were created with and is adopted.

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values ('00000000-0000-0000-0000-000000710106', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'myk9-710-latecomer@example.test', '', now(), now(), now(),
  '{}', '{}', false, false, false);

do $$
begin
  if (select auth_user_id from public.people where id = '00000000-0000-0000-0000-000000710016')
     is distinct from '00000000-0000-0000-0000-000000710106'::uuid then
    raise exception 'FAIL mail-in exhibitor was not adopted at signup';
  end if;
  raise notice 'PASS mail-in adoption at signup still links the existing person';
end;
$$;

-- A site admin can unlink and relink, and change a guarded email.
select pg_temp.expect('site admin can unlink an identity',
  pg_temp.run_as('00000000-0000-0000-0000-000000710103',
    $s$update public.people set auth_user_id = null where id = '00000000-0000-0000-0000-000000710012'$s$),
  'ok:1');
select pg_temp.expect('site admin can relink an identity',
  pg_temp.run_as('00000000-0000-0000-0000-000000710103',
    $s$update public.people set auth_user_id = '00000000-0000-0000-0000-000000710102'
        where id = '00000000-0000-0000-0000-000000710012'$s$),
  'ok:1');
select pg_temp.expect('site admin can change an unlinked role holder''s email',
  pg_temp.run_as('00000000-0000-0000-0000-000000710103',
    $s$update public.people set email = 'myk9-710-invitee-new@example.test'
        where id = '00000000-0000-0000-0000-000000710015'$s$),
  'ok:1');

-- The invite flow: a person with a pre-assigned role is adopted at signup and
-- the role follows the new identity (migration 159).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values ('00000000-0000-0000-0000-000000710105', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'myk9-710-invitee-new@example.test', '', now(), now(), now(),
  '{}', '{}', false, false, false);

do $$
begin
  if (select auth_user_id from public.people where id = '00000000-0000-0000-0000-000000710015')
     is distinct from '00000000-0000-0000-0000-000000710105'::uuid then
    raise exception 'FAIL invited role holder was not adopted at signup';
  end if;
  if (select ur.auth_user_id from public.user_roles ur
        join public.roles r on r.id = ur.role_id
       where ur.user_id = '00000000-0000-0000-0000-000000710015' and r.name = 'secretary')
     is distinct from '00000000-0000-0000-0000-000000710105'::uuid then
    raise exception 'FAIL pre-assigned role did not follow the invited identity';
  end if;
  raise notice 'PASS invite flow: pre-assigned role follows the adopted identity';
end;
$$;

rollback;
