-- MYK9-712: only a site admin (or a server path) may change people.status.
-- MYK9-710 option C: once a person has a live entry (as handler, owner or
-- co-owner), only a site admin or a server path may change their email.
-- MYK9-711: insert_club_access_request_from_signup is callable only from the
-- signup trigger path, not by a signed-in client.
-- Behavioral test for 20260923211700_myk9_711_712_status_site_admin_and_signup_grants.sql.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
--
-- Fixture order matters: `people` rows are seeded BEFORE their `auth.users`
-- rows so the signup trigger ADOPTS them (see sign_in_email_invariant_test.sql).
--
-- Every refusal is paired with a positive control on the SAME row and caller
-- (an unguarded column update that succeeds), so a refusal proves the status
-- guard fired rather than RLS hiding the row.

begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000712001', 'MYK9-712 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000712002', 'MYK9-712 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000712001', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000712003', '00000000-0000-0000-0000-000000712002',
  'MYK9-712 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000712004', '00000000-0000-0000-0000-000000712003',
  'Container Novice', 'upcoming');

-- 011 secretary, 012 site admin (the victim: made manageable via handler_id),
-- 013 a second site admin (the operator), 014 mail-in exhibitor (manageable via
-- their dog), 015 signed-up exhibitor who will be suspended.
-- Option C: 016 mail-in with no entries, 017 mail-in owner of an entered dog who
-- later signs up, 018 co-owner only, 019 handler only. All unlinked, no roles.
insert into public.people (id, first_name, last_name, email)
values
  ('00000000-0000-0000-0000-000000712011', 'MYK9-712', 'Secretary', 'myk9-712-secretary@example.test'),
  ('00000000-0000-0000-0000-000000712012', 'MYK9-712', 'Victim', 'myk9-712-victim@example.test'),
  ('00000000-0000-0000-0000-000000712013', 'MYK9-712', 'Admin', 'myk9-712-admin@example.test'),
  ('00000000-0000-0000-0000-000000712014', 'MYK9-712', 'Mailin', 'myk9-712-mailin@example.test'),
  ('00000000-0000-0000-0000-000000712015', 'MYK9-712', 'Exhibitor', 'myk9-712-exhibitor@example.test'),
  ('00000000-0000-0000-0000-000000712016', 'MYK9-712', 'NoEntries', 'myk9-712-noentries@example.test'),
  ('00000000-0000-0000-0000-000000712017', 'MYK9-712', 'Owner', 'myk9-712-owner@example.test'),
  ('00000000-0000-0000-0000-000000712018', 'MYK9-712', 'CoOwner', 'myk9-712-coowner@example.test'),
  ('00000000-0000-0000-0000-000000712019', 'MYK9-712', 'Handler', 'myk9-712-handler@example.test');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000712101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-712-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000712102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-712-victim@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000712103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-712-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000712105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-712-exhibitor@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000000712011', id,
  '00000000-0000-0000-0000-000000712001', true, '00000000-0000-0000-0000-000000712101'
from public.roles where name = 'secretary';
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select person_id, r.id, true, auth_id
from public.roles r,
  (values
    ('00000000-0000-0000-0000-000000712012'::uuid, '00000000-0000-0000-0000-000000712102'::uuid),
    ('00000000-0000-0000-0000-000000712013'::uuid, '00000000-0000-0000-0000-000000712103'::uuid)
  ) as admins(person_id, auth_id)
where r.name = 'site_admin';

-- The secretary's show names the victim site admin as handler and holds the
-- mail-in exhibitor's and the signed-up exhibitor's dogs, which makes all three
-- manageable people for the secretary.
insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id)
values
  ('00000000-0000-0000-0000-000000712021', 'MYK9-712 Dog', 'Dog', 'Beagle',
   '00000000-0000-0000-0000-000000712014', null),
  ('00000000-0000-0000-0000-000000712022', 'MYK9-712 Dog Two', 'Two', 'Beagle',
   '00000000-0000-0000-0000-000000712015', null),
  ('00000000-0000-0000-0000-000000712023', 'MYK9-712 Dog Three', 'Three', 'Beagle',
   '00000000-0000-0000-0000-000000712017', '00000000-0000-0000-0000-000000712018');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
values
  ('00000000-0000-0000-0000-000000712021', 'AKC (American Kennel Club)', 'SR712021', true),
  ('00000000-0000-0000-0000-000000712022', 'AKC (American Kennel Club)', 'SR712022', true),
  ('00000000-0000-0000-0000-000000712023', 'AKC (American Kennel Club)', 'SR712023', true);
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
values
  ('00000000-0000-0000-0000-000000712031', '00000000-0000-0000-0000-000000712021',
   '00000000-0000-0000-0000-000000712004', '00000000-0000-0000-0000-000000712002',
   '00000000-0000-0000-0000-000000712003', 'MYK9-712 Victim',
   '00000000-0000-0000-0000-000000712012', 'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000000712032', '00000000-0000-0000-0000-000000712022',
   '00000000-0000-0000-0000-000000712004', '00000000-0000-0000-0000-000000712002',
   '00000000-0000-0000-0000-000000712003', 'MYK9-712 Exhibitor',
   '00000000-0000-0000-0000-000000712015', 'confirmed', 'pending', 25, 'no-status'),
  -- Dog owned by 017, co-owned by 018, handled by 019.
  ('00000000-0000-0000-0000-000000712033', '00000000-0000-0000-0000-000000712023',
   '00000000-0000-0000-0000-000000712004', '00000000-0000-0000-0000-000000712002',
   '00000000-0000-0000-0000-000000712003', 'MYK9-712 Handler',
   '00000000-0000-0000-0000-000000712019', 'confirmed', 'pending', 25, 'no-status');

-- Stands in for a SECURITY DEFINER RPC: it bypasses RLS (it runs as the owner)
-- but, like any definer RPC called through PostgREST, leaves the `role` GUC at
-- 'authenticated', so the email guard still judges the caller. This is the only
-- way to reach a person with NO entries as a secretary: people_update admits a
-- secretary only through can_manage_show_person, which needs an entry.
create function pg_temp.definer_set_email(p uuid, new_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.people set email = new_email where id = p;
end;
$$;
grant execute on function pg_temp.definer_set_email(uuid, text) to authenticated;

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
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
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

create function pg_temp.status_of(p uuid) returns text language sql as $$
  select status from public.people where id = p $$;

-- Precondition: the seeded people with auth rows were adopted.
do $$
begin
  if (select count(*) from public.people
       where id in ('00000000-0000-0000-0000-000000712011', '00000000-0000-0000-0000-000000712012',
                    '00000000-0000-0000-0000-000000712013', '00000000-0000-0000-0000-000000712015')
         and auth_user_id is not null) <> 4 then
    raise exception 'FAIL fixture: seeded people were not adopted at signup';
  end if;
end;
$$;

-- ===========================================================================
-- MYK9-712
-- ===========================================================================

-- Positive controls: RLS admits both target rows to the secretary.
select pg_temp.expect('secretary can update an unguarded column on the victim site admin',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set city = 'Anywhere' where id = '00000000-0000-0000-0000-000000712012'$s$),
  'ok:1');
select pg_temp.expect('secretary can update an unguarded column on the mail-in exhibitor',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set city = 'Anywhere' where id = '00000000-0000-0000-0000-000000712014'$s$),
  'ok:1');

-- A secretary cannot suspend a person they manage, a site admin included.
select pg_temp.expect('secretary cannot suspend a site admin made manageable via handler_id',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set status = 'suspended' where id = '00000000-0000-0000-0000-000000712012'$s$),
  '42501');
select pg_temp.expect('secretary cannot suspend a manageable mail-in exhibitor',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set status = 'suspended' where id = '00000000-0000-0000-0000-000000712014'$s$),
  '42501');
select pg_temp.expect('victim site admin is still active', pg_temp.status_of('00000000-0000-0000-0000-000000712012'), 'active');

-- A site admin can suspend.
select pg_temp.expect('site admin can suspend a person',
  pg_temp.run_as('00000000-0000-0000-0000-000000712103',
    $s$update public.people set status = 'suspended' where id = '00000000-0000-0000-0000-000000712015'$s$),
  'ok:1');
select pg_temp.expect('suspension stored', pg_temp.status_of('00000000-0000-0000-0000-000000712015'), 'suspended');

-- Neither the managing secretary nor the suspended person can reinstate.
select pg_temp.expect('secretary cannot reinstate a person they manage',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set status = 'active' where id = '00000000-0000-0000-0000-000000712015'$s$),
  '42501');
select pg_temp.expect('a suspended person can still update an unguarded column on their own row',
  pg_temp.run_as('00000000-0000-0000-0000-000000712105',
    $s$update public.people set city = 'Home' where id = '00000000-0000-0000-0000-000000712015'$s$),
  'ok:1');
select pg_temp.expect('a suspended person cannot reinstate themselves',
  pg_temp.run_as('00000000-0000-0000-0000-000000712105',
    $s$update public.people set status = 'active' where id = '00000000-0000-0000-0000-000000712015'$s$),
  '42501');
select pg_temp.expect('still suspended', pg_temp.status_of('00000000-0000-0000-0000-000000712015'), 'suspended');

-- A site admin can reinstate.
select pg_temp.expect('site admin can reinstate a person',
  pg_temp.run_as('00000000-0000-0000-0000-000000712103',
    $s$update public.people set status = 'active' where id = '00000000-0000-0000-0000-000000712015'$s$),
  'ok:1');

-- A server path (no PostgREST role, e.g. a migration or seed script) is allowed.
update public.people set status = 'suspended' where id = '00000000-0000-0000-0000-000000712014';
select pg_temp.expect('server path can change status', pg_temp.status_of('00000000-0000-0000-0000-000000712014'), 'suspended');
update public.people set status = 'active' where id = '00000000-0000-0000-0000-000000712014';

-- ===========================================================================
-- MYK9-710 option C
-- ===========================================================================

-- Positive control: RLS admits each entered person to the secretary.
select pg_temp.expect('secretary can update an unguarded column on the entered owner',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set phone = '555-0100' where id = '00000000-0000-0000-0000-000000712017'$s$),
  'ok:1');

-- A secretary cannot re-point the email of a person with entries, through any
-- of the three relationships.
select pg_temp.expect('secretary cannot change the email of a mail-in owner with entries',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set email = 'attacker@example.test' where id = '00000000-0000-0000-0000-000000712014'$s$),
  '42501');
select pg_temp.expect('secretary cannot change the email of a co-owner with entries',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set email = 'attacker@example.test' where id = '00000000-0000-0000-0000-000000712018'$s$),
  '42501');
select pg_temp.expect('secretary cannot change the email of a handler with entries',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set email = 'attacker@example.test' where id = '00000000-0000-0000-0000-000000712019'$s$),
  '42501');
select pg_temp.expect('nor through a definer RPC',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$select pg_temp.definer_set_email('00000000-0000-0000-0000-000000712014', 'attacker@example.test')$s$),
  '42501');

-- Same-address re-save (recased, padded) on an entered person is not a change.
select pg_temp.expect('secretary can re-save an unchanged email on an entered person',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set email = ' MYK9-712-Owner@Example.TEST ', city = 'Resaved'
        where id = '00000000-0000-0000-0000-000000712017'$s$),
  'ok:1');
-- ...but the padded, recased copy is not stored: handle_new_user() matches
-- LOWER(email) without trim, so storing it would block this person's adoption.
select pg_temp.expect('an unprivileged case/padding rewrite keeps the stored address',
  (select email from public.people where id = '00000000-0000-0000-0000-000000712017'),
  'myk9-712-owner@example.test');

-- A person with no entries is not reachable by a secretary's direct update
-- (RLS: no manageability without an entry)...
select pg_temp.expect('secretary cannot see a no-entries mail-in person for update',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$update public.people set email = 'myk9-712-noentries-fixed@example.test'
        where id = '00000000-0000-0000-0000-000000712016'$s$),
  'ok:0');
-- ...but the guard itself allows the correction before any entry exists.
select pg_temp.expect('secretary can correct a no-entries mail-in email (definer path)',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$select pg_temp.definer_set_email('00000000-0000-0000-0000-000000712016', 'myk9-712-noentries-fixed@example.test')$s$),
  'ok:1');
select pg_temp.expect('no-entries correction stored',
  (select email from public.people where id = '00000000-0000-0000-0000-000000712016'),
  'myk9-712-noentries-fixed@example.test');

-- A site admin can change the email in both cases.
select pg_temp.expect('site admin can change the email of a person with entries',
  pg_temp.run_as('00000000-0000-0000-0000-000000712103',
    $s$update public.people set email = 'myk9-712-mailin-fixed@example.test'
        where id = '00000000-0000-0000-0000-000000712014'$s$),
  'ok:1');
select pg_temp.expect('site admin can change the email of a person with no entries',
  pg_temp.run_as('00000000-0000-0000-0000-000000712103',
    $s$update public.people set email = 'myk9-712-noentries-admin@example.test'
        where id = '00000000-0000-0000-0000-000000712016'$s$),
  'ok:1');

-- Mail-in adoption at signup still works for a person with entries: their
-- email was set correctly when they were created, and adoption changes only
-- the link.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values ('00000000-0000-0000-0000-000000712107', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'myk9-712-owner@example.test', '', now(), now(), now(),
  '{}', '{}', false, false, false);

do $$
begin
  if (select auth_user_id from public.people where id = '00000000-0000-0000-0000-000000712017')
     is distinct from '00000000-0000-0000-0000-000000712107'::uuid then
    raise exception 'FAIL mail-in owner with entries was not adopted at signup';
  end if;
  raise notice 'PASS mail-in adoption at signup still links a person with entries';
end;
$$;

-- The editor's read of the same facts (person_email_lock_facts): answered for a
-- person the caller may update, NULL for anyone else, never callable by anon,
-- and the internal helper is callable by no client role.
create function pg_temp.facts_as(caller uuid, p uuid) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub', caller::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v := public.person_email_lock_facts(p);
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$$;

select pg_temp.expect('lock facts for a manageable handler with entries',
  pg_temp.facts_as('00000000-0000-0000-0000-000000712101', '00000000-0000-0000-0000-000000712019')::text,
  '{"has_roles": false, "has_entries": true, "has_sign_in": false}');
select pg_temp.expect('lock facts for a manageable co-owner with entries',
  (pg_temp.facts_as('00000000-0000-0000-0000-000000712101', '00000000-0000-0000-0000-000000712018') ->> 'has_entries'),
  'true');
select pg_temp.expect('lock facts for a linked site admin (as a site admin)',
  pg_temp.facts_as('00000000-0000-0000-0000-000000712103', '00000000-0000-0000-0000-000000712012')::text,
  '{"has_roles": true, "has_entries": true, "has_sign_in": true}');
select pg_temp.expect('lock facts for a no-entries person (as a site admin)',
  pg_temp.facts_as('00000000-0000-0000-0000-000000712103', '00000000-0000-0000-0000-000000712016')::text,
  '{"has_roles": false, "has_entries": false, "has_sign_in": false}');
select pg_temp.expect('lock facts are NULL for a person the secretary cannot update',
  coalesce(pg_temp.facts_as('00000000-0000-0000-0000-000000712101', '00000000-0000-0000-0000-000000712016')::text, 'null'),
  'null');

do $$
begin
  if has_function_privilege('anon', 'public.person_email_lock_facts(uuid)', 'EXECUTE') then
    raise exception 'FAIL anon can execute person_email_lock_facts';
  end if;
  if not has_function_privilege('authenticated', 'public.person_email_lock_facts(uuid)', 'EXECUTE') then
    raise exception 'FAIL authenticated cannot execute person_email_lock_facts';
  end if;
  if has_function_privilege('authenticated', 'public.person_email_lock_facts_unchecked(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.person_email_lock_facts_unchecked(uuid)', 'EXECUTE') then
    raise exception 'FAIL a client role can execute person_email_lock_facts_unchecked';
  end if;
  raise notice 'PASS person_email_lock_facts is authenticated-only and its internal helper is not client-callable';
end;
$$;

-- ===========================================================================
-- MYK9-711
-- ===========================================================================

do $$
declare
  fn constant regprocedure := 'public.insert_club_access_request_from_signup(uuid,uuid,jsonb)'::regprocedure;
begin
  if has_function_privilege('authenticated', fn, 'EXECUTE') then
    raise exception 'FAIL authenticated can execute insert_club_access_request_from_signup';
  end if;
  if has_function_privilege('anon', fn, 'EXECUTE') then
    raise exception 'FAIL anon can execute insert_club_access_request_from_signup';
  end if;
  if not has_function_privilege('supabase_auth_admin', fn, 'EXECUTE') then
    raise exception 'FAIL supabase_auth_admin lost EXECUTE on insert_club_access_request_from_signup';
  end if;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'FAIL service_role lost EXECUTE on insert_club_access_request_from_signup';
  end if;
  raise notice 'PASS insert_club_access_request_from_signup EXECUTE is auth-admin/service-role only';
end;
$$;

-- A signed-in user calling it directly to file a request as someone else.
select pg_temp.expect('authenticated cannot call insert_club_access_request_from_signup',
  pg_temp.run_as('00000000-0000-0000-0000-000000712101',
    $s$select public.insert_club_access_request_from_signup(
         '00000000-0000-0000-0000-000000712012',
         '00000000-0000-0000-0000-000000712102',
         '{"intended_roles": ["club_officer"], "requested_club_name": "Forged Club"}'::jsonb)$s$),
  '42501');

do $$
begin
  if exists (select 1 from public.club_access_requests where lower(requested_club_name) = 'forged club') then
    raise exception 'FAIL a forged club access request was written';
  end if;
end;
$$;

-- Signup with club-officer metadata still materializes a request through the
-- auth.users trigger path.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values ('00000000-0000-0000-0000-000000712109', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'myk9-712-officer@example.test', '', now(), now(), now(),
  '{}',
  '{"first_name": "Club", "last_name": "Officer", "intended_roles": ["club_officer"], "requested_club_name": "MYK9-711 Kennel Club"}',
  false, false, false);

do $$
begin
  if not exists (
    select 1
      from public.club_access_requests car
      join public.people p on p.id = car.requester_person_id
     where car.requester_auth_user_id = '00000000-0000-0000-0000-000000712109'
       and p.auth_user_id = '00000000-0000-0000-0000-000000712109'
       and car.requested_club_name = 'MYK9-711 Kennel Club'
       and car.status = 'pending'
  ) then
    raise exception 'FAIL signup with club-officer metadata did not materialize a club access request';
  end if;
  raise notice 'PASS signup with club-officer metadata still materializes a club access request';
end;
$$;

rollback;
