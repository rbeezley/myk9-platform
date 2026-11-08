-- MYK9-1757: entries.check_in_pulled_by says WHO flagged a pull (exhibitor via
-- self_checkin_entry, staff via every other writer), is stamped only by the
-- MYK9-1396 trigger, and reaches the desk on the replication view's row.
-- Executes the installed functions as the real roles. Run with
-- psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
begin;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000175701', 'MYK9-1757 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status)
values ('00000000-0000-0000-0000-000000175702', 'MYK9-1757 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000175701', 'published');
insert into public.trials (id, show_id, name, date, registry_id)
values ('00000000-0000-0000-0000-000000175703', '00000000-0000-0000-0000-000000175702',
  'MYK9-1757 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status)
values ('00000000-0000-0000-0000-000000175704', '00000000-0000-0000-0000-000000175703',
  'Container Novice', 'upcoming');

-- An exhibitor (owner of the dogs) and a club-scoped secretary.
insert into public.people (id, first_name, last_name, email, auth_user_id)
values
  ('00000000-0000-0000-0000-000000175711', 'MYK9-1757', 'Owner', 'myk9-1757-owner@example.test', null),
  ('00000000-0000-0000-0000-000000175712', 'MYK9-1757', 'Secretary', 'myk9-1757-secretary@example.test', null);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
values
  ('00000000-0000-0000-0000-000000175791', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1757-owner@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000175792', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1757-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);
update public.people
   set auth_user_id = case email
     when 'myk9-1757-owner@example.test' then '00000000-0000-0000-0000-000000175791'::uuid
     when 'myk9-1757-secretary@example.test' then '00000000-0000-0000-0000-000000175792'::uuid
   end
 where email in ('myk9-1757-owner@example.test', 'myk9-1757-secretary@example.test');
insert into public.user_roles (user_id, role_id, is_active, granted_by, auth_user_id, club_id)
select '00000000-0000-0000-0000-000000175712', id, true,
  '00000000-0000-0000-0000-000000175712', '00000000-0000-0000-0000-000000175792',
  '00000000-0000-0000-0000-000000175701'
from public.roles where name = 'secretary';

insert into public.dogs (id, name, call_name, breed, owner_id)
select ('00000000-0000-0000-0000-00000017572' || n)::uuid, 'MYK9-1757 Dog ' || n, 'Dog', 'Beagle',
  '00000000-0000-0000-0000-000000175711'
from generate_series(1, 2) n;
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select ('00000000-0000-0000-0000-00000017572' || n)::uuid, 'AKC (American Kennel Club)',
  'SR17572' || n, true
from generate_series(1, 2) n;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
select ('00000000-0000-0000-0000-00000017573' || n)::uuid,
  ('00000000-0000-0000-0000-00000017572' || n)::uuid,
  '00000000-0000-0000-0000-000000175704', '00000000-0000-0000-0000-000000175702',
  '00000000-0000-0000-0000-000000175703', '00000000-0000-0000-0000-000000175711',
  'confirmed', 'pending', 25, 'checked-in'
from generate_series(1, 2) n;

create function pg_temp.fail_if(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond then raise exception 'FAIL %', msg; end if;
end;
$$;

create function pg_temp.row_of(p_id uuid) returns text
language sql as $$
  select concat_ws('/', check_in_status, coalesce(check_in_pulled_by, '-'))
  from public.entries where id = p_id;
$$;

create function pg_temp.act_as(p_auth text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;


-- Self check-in Pull is the exhibitor's; any other writer is staff.
do $$
declare
  v_a constant uuid := '00000000-0000-0000-0000-000000175731';
  v_b constant uuid := '00000000-0000-0000-0000-000000175732';
begin
  perform pg_temp.fail_if(pg_temp.row_of(v_a) is distinct from 'checked-in/-',
    'a fresh row is not stamped: ' || pg_temp.row_of(v_a));

  perform pg_temp.act_as('00000000-0000-0000-0000-000000175791');
  perform public.self_checkin_entry(v_a, 'pulled');
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_a) is distinct from 'pulled/exhibitor',
    'self check-in Pull is not credited to the exhibitor: ' || pg_temp.row_of(v_a));
  -- The marker must not outlive the call.
  perform pg_temp.fail_if(coalesce(current_setting('myk9.pull_source', true), '') <> '',
    'self_checkin_entry left myk9.pull_source set');

  update public.entries set check_in_status = 'pulled' where id = v_b;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from 'pulled/staff',
    'a direct Pull is not credited to staff: ' || pg_temp.row_of(v_b));

  raise notice 'PASS the source is stamped by the writer that set Pulled';
end;
$$;

-- Leaving pulled clears it; a re-flag by the OTHER source after Clear is credited to the new one.
do $$
declare
  v_a constant uuid := '00000000-0000-0000-0000-000000175731';
  v_b constant uuid := '00000000-0000-0000-0000-000000175732';
  v_result text;
begin
  -- v_a was flagged by the exhibitor; the secretary clears it.
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175792');
  v_result := public.clear_flagged_pull(v_a);
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_a) is distinct from 'checked-in/-',
    'Clear left a source behind: ' || pg_temp.row_of(v_a));

  -- Staff re-flags it: credited to staff, not to the earlier exhibitor.
  update public.entries set check_in_status = 'pulled' where id = v_a;
  perform pg_temp.fail_if(pg_temp.row_of(v_a) is distinct from 'pulled/staff',
    'a staff re-flag was credited to ' || pg_temp.row_of(v_a));

  -- v_b was flagged by staff; clear, then the exhibitor re-flags it.
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175792');
  v_result := public.clear_flagged_pull(v_b);
  reset role;
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175791');
  perform public.self_checkin_entry(v_b, 'pulled');
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from 'pulled/exhibitor',
    'an exhibitor re-flag was credited to ' || pg_temp.row_of(v_b));

  -- A plain status change away from pulled also clears it.
  update public.entries set check_in_status = 'checked-in' where id = v_b;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from 'checked-in/-',
    'leaving pulled kept a source: ' || pg_temp.row_of(v_b));

  raise notice 'PASS a re-flag after a Clear is credited to the new source';
end;
$$;

-- The source cannot be planted, by UPDATE or INSERT, as superuser or as a manager.
do $$
declare
  v_a constant uuid := '00000000-0000-0000-0000-000000175731';
  v_b constant uuid := '00000000-0000-0000-0000-000000175732';
  v_new constant uuid := '00000000-0000-0000-0000-000000175739';
begin
  -- A value on a row that is not pulled is discarded.
  update public.entries set check_in_pulled_by = 'exhibitor' where id = v_b;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from 'checked-in/-',
    'a planted source on a non-pulled row survived: ' || pg_temp.row_of(v_b));

  -- A staff Pull that also names the exhibitor is still staff.
  update public.entries set check_in_status = 'pulled', check_in_pulled_by = 'exhibitor'
   where id = v_b;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from 'pulled/staff',
    'a planted exhibitor source survived a staff Pull: ' || pg_temp.row_of(v_b));

  -- Rewriting the source alone on a pulled row keeps the stamped value.
  update public.entries set check_in_pulled_by = 'exhibitor' where id = v_b;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from 'pulled/staff',
    'rewriting the source alone changed it: ' || pg_temp.row_of(v_b));

  -- A manager session cannot plant it either (permission denied or overwritten, never kept).
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175792');
  begin
    update public.entries set check_in_pulled_by = 'exhibitor' where id = v_b;
  exception when others then null;
  end;
  reset role;
  perform pg_temp.fail_if(pg_temp.row_of(v_b) is distinct from 'pulled/staff',
    'a manager planted a source: ' || pg_temp.row_of(v_b));

  -- INSERT: planted on a non-pulled row is NULL; inserted as pulled with a plant is staff.
  insert into public.dogs (id, name, call_name, breed, owner_id)
  values ('00000000-0000-0000-0000-000000175723', 'MYK9-1757 Dog 3', 'Dog', 'Beagle',
    '00000000-0000-0000-0000-000000175711');
  insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
  values ('00000000-0000-0000-0000-000000175723', 'AKC (American Kennel Club)', 'SR175723', true);
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id,
    entry_status, payment_status, entry_fee, check_in_status, check_in_pulled_by)
  values (v_new, '00000000-0000-0000-0000-000000175723',
    '00000000-0000-0000-0000-000000175704', '00000000-0000-0000-0000-000000175702',
    '00000000-0000-0000-0000-000000175703', '00000000-0000-0000-0000-000000175711',
    'confirmed', 'pending', 25, 'checked-in', 'exhibitor');
  perform pg_temp.fail_if(pg_temp.row_of(v_new) is distinct from 'checked-in/-',
    'an inserted plant survived: ' || pg_temp.row_of(v_new));
  delete from public.entries where id = v_new;

  -- No client role may read the base column.
  perform pg_temp.fail_if(has_column_privilege('anon', 'public.entries', 'check_in_pulled_by', 'SELECT'),
    'anon can read entries.check_in_pulled_by');
  perform pg_temp.fail_if(has_column_privilege('authenticated', 'public.entries', 'check_in_pulled_by', 'SELECT'),
    'authenticated can read entries.check_in_pulled_by directly');

  raise notice 'PASS the source cannot be planted';
end;
$$;

-- The desk's row carries it: the replication view returns the column, owner-run still.
do $$
declare
  v_b constant uuid := '00000000-0000-0000-0000-000000175732';
  v_seen text;
  v_options text[];
  v_view regclass;
begin
  perform pg_temp.act_as('00000000-0000-0000-0000-000000175792');
  select check_in_pulled_by into v_seen
    from public.view_authenticated_entry_results_replication where id = v_b;
  reset role;
  perform pg_temp.fail_if(v_seen is distinct from 'staff',
    'the replication view returned ' || coalesce(v_seen, 'NULL'));

  perform pg_temp.act_as('00000000-0000-0000-0000-000000175792');
  select check_in_pulled_by into v_seen
    from public.view_authenticated_entry_results where id = v_b;
  reset role;
  perform pg_temp.fail_if(v_seen is distinct from 'staff',
    'the inner view returned ' || coalesce(v_seen, 'NULL'));

  -- The view's last column, and security_invoker still false (CREATE OR REPLACE resets it).
  perform pg_temp.fail_if((
    select a.attname from pg_attribute a
     where a.attrelid = 'public.view_authenticated_entry_results_replication'::regclass
       and a.attnum > 0 and not a.attisdropped order by a.attnum desc limit 1
  ) is distinct from 'check_in_pulled_by', 'check_in_pulled_by is not the replication view''s last column');
  -- reloptions folded: a missing option reads as the default (invoker = false), but the rebuilt
  -- views must say security_invoker=false or at least never true.
  for v_view in select unnest(array[
    'public.view_authenticated_entry_results'::regclass,
    'public.view_authenticated_entry_results_replication'::regclass
  ]) loop
    select c.reloptions into v_options from pg_class c where c.oid = v_view;
    perform pg_temp.fail_if(coalesce(v_options, '{}') @> array['security_invoker=true'],
      v_view::regclass::text || ' is security_invoker after the rebuild');
    perform pg_temp.fail_if(not (coalesce(v_options, '{}') @> array['security_invoker=false']),
      v_view::regclass::text || ' lost its explicit security_invoker=false');
  end loop;

  raise notice 'PASS the replication view carries check_in_pulled_by and stays owner-run';
end;
$$;

rollback;
