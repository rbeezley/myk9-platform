-- MYK9-114 behavioral characterization for view_authenticated_entry_results.
-- Run before and after 20260728210000_materialize_entry_access_context.sql.
-- Fixed fixtures and claims are transaction-local and roll back.

begin;

-- Schema-only isolated databases have no seed data. Keep the matrix
-- self-contained, including the legacy-compatible trial_secretary branch still
-- accepted by is_trial_secretary().
insert into public.roles (id, name, description, is_system)
values
  ('00000000-0000-0000-0000-000000114801', 'site_admin', 'MYK9-114 fixture', true),
  ('00000000-0000-0000-0000-000000114802', 'secretary', 'MYK9-114 fixture', true),
  ('00000000-0000-0000-0000-000000114803', 'trial_secretary', 'MYK9-114 fixture', true),
  ('00000000-0000-0000-0000-000000114804', 'club_admin', 'MYK9-114 fixture', true),
  ('00000000-0000-0000-0000-000000114805', 'steward', 'MYK9-114 fixture', true)
on conflict (name) do nothing;

insert into public.clubs (id, name)
values ('00000000-0000-0000-0000-000000114001', 'MYK9-114 Test Club');

insert into public.people (id, first_name, last_name, auth_user_id)
values
  ('00000000-0000-0000-0000-000000114011', 'Site', 'Admin', '00000000-0000-0000-0000-000000114101'),
  ('00000000-0000-0000-0000-000000114012', 'Scoped', 'Manager', '00000000-0000-0000-0000-000000114102'),
  ('00000000-0000-0000-0000-000000114013', 'Assigned', 'Judge', '00000000-0000-0000-0000-000000114103'),
  ('00000000-0000-0000-0000-000000114014', 'Show', 'Steward', '00000000-0000-0000-0000-000000114104'),
  ('00000000-0000-0000-0000-000000114015', 'Entry', 'Handler', '00000000-0000-0000-0000-000000114105'),
  ('00000000-0000-0000-0000-000000114016', 'Expired', 'Manager', '00000000-0000-0000-0000-000000114106'),
  ('00000000-0000-0000-0000-000000114017', 'Other', 'Owner', '00000000-0000-0000-0000-000000114107'),
  ('00000000-0000-0000-0000-000000114018', 'Trial', 'Secretary', '00000000-0000-0000-0000-000000114108'),
  ('00000000-0000-0000-0000-000000114019', 'Club', 'Admin', '00000000-0000-0000-0000-000000114109'),
  ('00000000-0000-0000-0000-000000114020', 'Club', 'Steward', '00000000-0000-0000-0000-000000114110'),
  ('00000000-0000-0000-0000-000000114023', 'Inactive', 'Manager', '00000000-0000-0000-0000-000000114111'),
  ('00000000-0000-0000-0000-000000114024', 'Invited', 'Judge', '00000000-0000-0000-0000-000000114112');

insert into public.club_members (club_id, person_id, membership_status)
values
  ('00000000-0000-0000-0000-000000114001', '00000000-0000-0000-0000-000000114012', 'active'),
  ('00000000-0000-0000-0000-000000114001', '00000000-0000-0000-0000-000000114018', 'active'),
  ('00000000-0000-0000-0000-000000114001', '00000000-0000-0000-0000-000000114019', 'active');

insert into public.shows (
  id, name, organization, start_date, end_date, club_id, status
) values
  ('00000000-0000-0000-0000-000000114002', 'MYK9-114 Access Context Test', 'AKC',
   current_date, current_date + 1, '00000000-0000-0000-0000-000000114001', 'published'),
  ('00000000-0000-0000-0000-000000114005', 'MYK9-114 Unscoped Access Test', 'AKC',
   current_date, current_date + 1, null, 'published');

insert into public.trials (id, show_id, name, date)
values
  ('00000000-0000-0000-0000-000000114003', '00000000-0000-0000-0000-000000114002',
   'MYK9-114 Trial', current_date),
  ('00000000-0000-0000-0000-000000114006', '00000000-0000-0000-0000-000000114005',
   'MYK9-114 Unscoped Trial', current_date);

insert into public.show_visibility_settings (
  show_id, preset, placement_timing, qualification_timing, time_timing, faults_timing
) values
  ('00000000-0000-0000-0000-000000114002', 'standard',
   'manual_release', 'manual_release', 'manual_release', 'manual_release'),
  ('00000000-0000-0000-0000-000000114005', 'standard',
   'manual_release', 'manual_release', 'manual_release', 'manual_release');

insert into public.classes (id, trial_id, name, status)
values
  ('00000000-0000-0000-0000-000000114004', '00000000-0000-0000-0000-000000114003',
   'Container Novice', 'upcoming'),
  ('00000000-0000-0000-0000-000000114007', '00000000-0000-0000-0000-000000114006',
   'Unscoped Container Novice', 'upcoming');

insert into public.dogs (id, name, call_name, breed, owner_id)
values
  ('00000000-0000-0000-0000-000000114021', 'Handler Dog', 'Handler Dog', 'Beagle',
   '00000000-0000-0000-0000-000000114015'),
  ('00000000-0000-0000-0000-000000114022', 'Other Dog', 'Other Dog', 'Beagle',
   '00000000-0000-0000-0000-000000114017'),
  ('00000000-0000-0000-0000-000000114025', 'Null Show Dog', 'Null Show Dog', 'Beagle',
   '00000000-0000-0000-0000-000000114017');

-- `trg_entries_require_dog_registration` (20260828210000) refuses an entry whose dog
-- holds no registration for the trial's registry. This fixture predates that rule and
-- is about something else, so give every dog an AKC number -- every trial here is AKC.
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary)
select d.id, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d.id::text), 1, 8)), true
from public.dogs d
where not exists (
  select 1 from public.dog_registrations r where r.dog_id = d.id
);

insert into public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, entry_status,
  payment_status, entry_fee, is_scored, result_status, total_score, judge_notes
) values
  (
    '00000000-0000-0000-0000-000000114031',
    '00000000-0000-0000-0000-000000114021',
    '00000000-0000-0000-0000-000000114004',
    '00000000-0000-0000-0000-000000114002',
    '00000000-0000-0000-0000-000000114003',
    '00000000-0000-0000-0000-000000114015',
    'confirmed', 'paid', 25, true, 'qualified', 100, 'handler entry score'
  ),
  (
    '00000000-0000-0000-0000-000000114032',
    '00000000-0000-0000-0000-000000114022',
    '00000000-0000-0000-0000-000000114004',
    '00000000-0000-0000-0000-000000114002',
    '00000000-0000-0000-0000-000000114003',
    '00000000-0000-0000-0000-000000114017',
    'confirmed', 'paid', 30, true, 'qualified', 90, 'other entry score'
  ),
  (
    '00000000-0000-0000-0000-000000114033',
    '00000000-0000-0000-0000-000000114022',
    '00000000-0000-0000-0000-000000114007',
    '00000000-0000-0000-0000-000000114005',
    '00000000-0000-0000-0000-000000114006',
    '00000000-0000-0000-0000-000000114017',
    'confirmed', 'paid', 35, true, 'qualified', 80, 'unscoped show score'
  ),
  (
    '00000000-0000-0000-0000-000000114034', '00000000-0000-0000-0000-000000114025',
    '00000000-0000-0000-0000-000000114004', null,
    '00000000-0000-0000-0000-000000114003', '00000000-0000-0000-0000-000000114017',
    'confirmed', 'paid', 40, true, 'qualified', 70, 'null-show score'
  );

insert into public.judge_assignments (
  id, person_id, show_id, trial_id, class_id, status
) values
  (
    '00000000-0000-0000-0000-000000114041',
    '00000000-0000-0000-0000-000000114013',
    '00000000-0000-0000-0000-000000114002',
    '00000000-0000-0000-0000-000000114003',
    '00000000-0000-0000-0000-000000114004',
    'confirmed'
  ),
  (
    '00000000-0000-0000-0000-000000114042',
    '00000000-0000-0000-0000-000000114024',
    '00000000-0000-0000-0000-000000114002',
    '00000000-0000-0000-0000-000000114003',
    '00000000-0000-0000-0000-000000114004',
    'invited'
  );

insert into public.user_roles (
  user_id, role_id, club_id, show_id, is_active, expires_at, auth_user_id
)
select person_id, roles.id, club_id, show_id, is_active, expires_at, auth_id
from (
  values
    (
      '00000000-0000-0000-0000-000000114011'::uuid,
      '00000000-0000-0000-0000-000000114101'::uuid,
      'site_admin'::text,
      null::uuid,
      null::uuid,
      true,
      null::timestamptz
    ),
    (
      '00000000-0000-0000-0000-000000114012'::uuid,
      '00000000-0000-0000-0000-000000114102'::uuid,
      'secretary'::text,
      '00000000-0000-0000-0000-000000114001'::uuid,
      null::uuid,
      true,
      null::timestamptz
    ),
    (
      '00000000-0000-0000-0000-000000114014'::uuid,
      '00000000-0000-0000-0000-000000114104'::uuid,
      'steward'::text,
      null::uuid,
      '00000000-0000-0000-0000-000000114002'::uuid,
      true,
      null::timestamptz
    ),
    (
      '00000000-0000-0000-0000-000000114016'::uuid,
      '00000000-0000-0000-0000-000000114106'::uuid,
      'secretary'::text,
      '00000000-0000-0000-0000-000000114001'::uuid,
      null::uuid,
      true,
      clock_timestamp() - interval '1 minute'
    ),
    (
      '00000000-0000-0000-0000-000000114018'::uuid,
      '00000000-0000-0000-0000-000000114108'::uuid,
      'trial_secretary'::text,
      '00000000-0000-0000-0000-000000114001'::uuid,
      null::uuid,
      true,
      null::timestamptz
    ),
    (
      '00000000-0000-0000-0000-000000114019'::uuid,
      '00000000-0000-0000-0000-000000114109'::uuid,
      'club_admin'::text,
      '00000000-0000-0000-0000-000000114001'::uuid,
      null::uuid,
      true,
      null::timestamptz
    ),
    (
      '00000000-0000-0000-0000-000000114020'::uuid,
      '00000000-0000-0000-0000-000000114110'::uuid,
      'steward'::text,
      '00000000-0000-0000-0000-000000114001'::uuid,
      null::uuid,
      true,
      null::timestamptz
    ),
    (
      '00000000-0000-0000-0000-000000114023'::uuid,
      '00000000-0000-0000-0000-000000114111'::uuid,
      'secretary'::text,
      '00000000-0000-0000-0000-000000114001'::uuid,
      null::uuid,
      false,
      null::timestamptz
    )
) as grants(person_id, auth_id, role_name, club_id, show_id, is_active, expires_at)
join public.roles on roles.name = grants.role_name;

insert into public.show_passcodes (
  id, show_id, role, passcode_hash, passcode_ciphertext, created_at
) values (
  '00000000-0000-0000-0000-000000114051',
  '00000000-0000-0000-0000-000000114002',
  'judge',
  'myk9-114-fixture-hash',
  null,
  '2026-07-28 20:00:00+00'::timestamptz
);

set local role authenticated;

-- Every manager role sees every scoped row, admin fields, and scores.
do $$
declare
  auth_id uuid;
  row_count integer;
  admin_count integer;
  score_count integer;
  null_show_count integer;
begin
  foreach auth_id in array array[
    '00000000-0000-0000-0000-000000114101'::uuid,
    '00000000-0000-0000-0000-000000114102'::uuid,
    '00000000-0000-0000-0000-000000114108'::uuid,
    '00000000-0000-0000-0000-000000114109'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', auth_id::text, true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', auth_id, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
      true
    );
    select count(*), count(payment_status), count(total_score)
      into row_count, admin_count, score_count
      from public.view_authenticated_entry_results
     where show_id = '00000000-0000-0000-0000-000000114002';
    if row_count <> 2 or admin_count <> 2 or score_count <> 2 then
      raise exception 'FAIL manager % rows/admin/scores: %/%/%',
        auth_id, row_count, admin_count, score_count;
    end if;
    select count(*) into null_show_count from public.view_authenticated_entry_results
     where id = '00000000-0000-0000-0000-000000114034';
    if null_show_count <> 0 then
      raise exception 'FAIL manager % can access null-show entry', auth_id;
    end if;
  end loop;
  raise notice 'PASS managers preserve scoped access and reject null-show entries';
end
$$;

-- A manager role preserves can_manage_show(NULL) parity for an unscoped show.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000114102', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000114102","role":"authenticated","app_metadata":{}}',
  true
);
do $$
declare
  row_count integer;
  admin_count integer;
  score_count integer;
begin
  select count(*), count(payment_status), count(total_score)
    into row_count, admin_count, score_count
    from public.view_authenticated_entry_results
   where show_id = '00000000-0000-0000-0000-000000114005';
  if row_count <> 1 or admin_count <> 1 or score_count <> 1 then
    raise exception 'FAIL null-club manager rows/admin/scores: %/%/%',
      row_count, admin_count, score_count;
  end if;
  raise notice 'PASS manager preserves null-club show access';
end
$$;

-- Confirmed and invited judges see scores but not payment/admin fields.
do $$
declare
  auth_id uuid;
  row_count integer;
  admin_count integer;
  score_count integer;
begin
  foreach auth_id in array array[
    '00000000-0000-0000-0000-000000114103'::uuid,
    '00000000-0000-0000-0000-000000114112'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', auth_id::text, true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', auth_id, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
      true
    );
    select count(*), count(payment_status), count(total_score)
      into row_count, admin_count, score_count
      from public.view_authenticated_entry_results
     where show_id = '00000000-0000-0000-0000-000000114002';
    if row_count <> 2 or admin_count <> 0 or score_count <> 2 then
      raise exception 'FAIL judge % rows/admin/scores: %/%/%',
        auth_id, row_count, admin_count, score_count;
    end if;
  end loop;
  raise notice 'PASS confirmed and invited judges preserve score-only access';
end
$$;

-- Show- and club-scoped stewards see rows but no protected fields.
do $$
declare
  auth_id uuid;
  row_count integer;
  admin_count integer;
  score_count integer;
  note_count integer;
begin
  foreach auth_id in array array[
    '00000000-0000-0000-0000-000000114104'::uuid,
    '00000000-0000-0000-0000-000000114110'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', auth_id::text, true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', auth_id, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
      true
    );
    select count(*), count(payment_status), count(total_score), count(judge_notes)
      into row_count, admin_count, score_count, note_count
      from public.view_authenticated_entry_results
     where show_id = '00000000-0000-0000-0000-000000114002';
    if row_count <> 2 or admin_count <> 0 or score_count <> 0 or note_count <> 0 then
      raise exception 'FAIL steward % rows/admin/scores/notes: %/%/%/%',
        auth_id, row_count, admin_count, score_count, note_count;
    end if;
  end loop;
  raise notice 'PASS show- and club-scoped stewards preserve row-only access';
end
$$;

-- Exhibitor sees the full queue, but admin fields only on the handler's entry.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000114105', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000114105","role":"authenticated","app_metadata":{}}',
  true
);
do $$
declare
  row_count integer;
  own_count integer;
  admin_count integer;
  score_count integer;
begin
  select count(*), count(*) filter (where is_own_entry), count(payment_status), count(total_score)
    into row_count, own_count, admin_count, score_count
    from public.view_authenticated_entry_results
   where show_id = '00000000-0000-0000-0000-000000114002';
  if row_count <> 2 or own_count <> 1 or admin_count <> 1 or score_count <> 0 then
    raise exception 'FAIL exhibitor rows/own/admin/scores: %/%/%/%',
      row_count, own_count, admin_count, score_count;
  end if;
  raise notice 'PASS exhibitor queue and own-entry gates are unchanged';
end
$$;

-- Expired and inactive manager roles fail closed.
do $$
declare
  auth_id uuid;
  row_count integer;
begin
  foreach auth_id in array array[
    '00000000-0000-0000-0000-000000114106'::uuid,
    '00000000-0000-0000-0000-000000114111'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', auth_id::text, true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', auth_id, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text,
      true
    );
    select count(*) into row_count
      from public.view_authenticated_entry_results
     where show_id = '00000000-0000-0000-0000-000000114002';
    if row_count <> 0 then
      raise exception 'FAIL inactive/expired manager % received % rows', auth_id, row_count;
    end if;
  end loop;
  raise notice 'PASS expired and inactive managers fail closed';
end
$$;

-- Anonymous authenticated session with a current judge claim sees scores.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000114199', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000114199","role":"authenticated","app_metadata":{"kind":"ringside_passcode","show_id":"00000000-0000-0000-0000-000000114002","ringside_role":"judge","passcode_generation":"2026-07-28T20:00:00+00:00"}}',
  true
);
do $$
declare
  row_count integer;
  score_count integer;
begin
  select count(*), count(total_score)
    into row_count, score_count
    from public.view_authenticated_entry_results
   where show_id = '00000000-0000-0000-0000-000000114002';
  if row_count <> 2 or score_count <> 2 then
    raise exception 'FAIL current judge claim rows/scores: %/%', row_count, score_count;
  end if;
  raise notice 'PASS no-person current claim preserves judge access';
end
$$;

-- A stale generation loses all claim-based access.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000114199","role":"authenticated","app_metadata":{"kind":"ringside_passcode","show_id":"00000000-0000-0000-0000-000000114002","ringside_role":"judge","passcode_generation":"2026-07-28T19:00:00+00:00"}}',
  true
);
do $$
declare
  row_count integer;
begin
  select count(*) into row_count
    from public.view_authenticated_entry_results
   where show_id = '00000000-0000-0000-0000-000000114002';
  if row_count <> 0 then
    raise exception 'FAIL stale claim received % rows', row_count;
  end if;
  raise notice 'PASS stale claim fails closed';
end
$$;

-- A claim with no passcode generation also fails closed.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000114199","role":"authenticated","app_metadata":{"kind":"ringside_passcode","show_id":"00000000-0000-0000-0000-000000114002","ringside_role":"judge"}}',
  true
);
do $$
declare
  row_count integer;
begin
  select count(*) into row_count
    from public.view_authenticated_entry_results
   where show_id = '00000000-0000-0000-0000-000000114002';
  if row_count <> 0 then
    raise exception 'FAIL missing-generation claim received % rows', row_count;
  end if;
  raise notice 'PASS missing-generation claim fails closed';
end
$$;

-- After the new migration, direct helper invocation remains unavailable while
-- the authenticated view reads above continue to work.
reset role;
do $$
begin
  if to_regprocedure('private.entry_results_caller_context()') is not null then
    execute 'set local role authenticated';
    begin
      execute 'select * from private.entry_results_caller_context()';
      raise exception 'FAIL authenticated directly invoked private helper';
    exception when insufficient_privilege then
      raise notice 'PASS direct private helper invocation denied';
    end;
    execute 'reset role';
  end if;
end
$$;

\if :{?commit_fixtures}
  \if :commit_fixtures
    \echo 'ISOLATED MODE: committing MYK9-114 fixtures for plan evidence'
    commit;
  \else
    rollback;
  \endif
\else
  rollback;
\endif
