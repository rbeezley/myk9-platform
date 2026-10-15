-- MYK9-1162: the sixth lifecycle step, registration_number_needed.
--
--   A. a new show is seeded with the step, enabled
--   B. both step_type CHECKs accept the new value and still refuse an unknown one
--   C. ensure_show_lifecycle_email_steps restores a missing step (the backfill
--      path) and is idempotent
--   D. the five earlier step types are still accepted, and each table has exactly
--      one step_type CHECK (the old one was dropped, not left beside the new)
--   E. service_role may execute entry_awaiting_registration_number, which
--      send-lifecycle-email asks before sending this step
--
-- Fixtures roll back.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000001162301', 'MYK9-1162 Lifecycle Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001162302', 'MYK9-1162 Lifecycle Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001162301', 'draft');

do $$
declare v_enabled boolean;
begin
  select is_enabled into v_enabled from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001162302' and step_type = 'registration_number_needed';
  if v_enabled is distinct from true then
    raise exception 'FAIL A new show is not seeded with an enabled registration_number_needed step (%)', v_enabled;
  end if;
  raise notice 'PASS A a new show is seeded with the registration_number_needed step';
end $$;

do $$
declare v_step uuid;
begin
  select id into v_step from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001162302' and step_type = 'registration_number_needed';

  insert into public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, recipient_scope, recipient_email, idempotency_key
  ) values (
    '00000000-0000-0000-0000-000001162302', v_step, 'registration_number_needed', 'entry',
    'a@example.test', 'myk9-1162-lifecycle-test'
  );

  begin
    insert into public.show_lifecycle_email_steps (show_id, step_type)
    values ('00000000-0000-0000-0000-000001162302', 'not_a_step');
    raise exception 'FAIL B the steps CHECK accepted an unknown step_type';
  exception when check_violation then null;
  end;

  begin
    insert into public.show_lifecycle_email_jobs (
      show_id, step_id, step_type, recipient_scope, recipient_email, idempotency_key
    ) values (
      '00000000-0000-0000-0000-000001162302', v_step, 'not_a_step', 'entry',
      'a@example.test', 'myk9-1162-lifecycle-test-bad'
    );
    raise exception 'FAIL B the jobs CHECK accepted an unknown step_type';
  exception when check_violation then null;
  end;
  raise notice 'PASS B both CHECKs accept registration_number_needed and refuse an unknown step_type';
end $$;

do $$
declare v_count integer;
begin
  delete from public.show_lifecycle_email_jobs where show_id = '00000000-0000-0000-0000-000001162302';
  delete from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001162302' and step_type = 'registration_number_needed';
  perform public.ensure_show_lifecycle_email_steps('00000000-0000-0000-0000-000001162302');
  perform public.ensure_show_lifecycle_email_steps('00000000-0000-0000-0000-000001162302');
  select count(*) into v_count from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001162302';
  if v_count <> 6 then
    raise exception 'FAIL C expected 6 steps after the backfill path, found %', v_count;
  end if;
  raise notice 'PASS C the ensure function backfills the step and is idempotent';
end $$;

do $$
declare
  v_step uuid;
  v_type text;
  v_checks integer;
begin
  select id into v_step from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001162302' and step_type = 'accepted';
  foreach v_type in array array['accepted', 'waitlisted', 'two_week_reminder',
                                'day_before_reminder', 'results_available'] loop
    insert into public.show_lifecycle_email_jobs (
      show_id, step_id, step_type, recipient_scope, recipient_email, idempotency_key
    ) values (
      '00000000-0000-0000-0000-000001162302', v_step, v_type, 'entry',
      'a@example.test', 'myk9-1162-lifecycle-old-' || v_type
    );
  end loop;

  foreach v_type in array array['show_lifecycle_email_steps', 'show_lifecycle_email_jobs'] loop
    select count(*) into v_checks
      from pg_constraint c
     where c.conrelid = ('public.' || v_type)::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%step_type%';
    if v_checks <> 1 then
      raise exception 'FAIL D % has % step_type CHECKs, expected exactly 1', v_type, v_checks;
    end if;
  end loop;
  raise notice 'PASS D the five earlier step types are accepted and one step_type CHECK remains per table';
end $$;

do $$
begin
  if not has_function_privilege(
    'service_role',
    'public.entry_awaiting_registration_number(uuid, uuid, text, timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'FAIL E service_role cannot execute entry_awaiting_registration_number';
  end if;
  if has_function_privilege(
    'anon',
    'public.entry_awaiting_registration_number(uuid, uuid, text, timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'FAIL E anon can execute entry_awaiting_registration_number';
  end if;
  if has_function_privilege('authenticated', 'public.ensure_show_lifecycle_email_steps(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.ensure_show_lifecycle_email_steps(uuid)', 'EXECUTE') then
    raise exception 'FAIL E an API role can call ensure_show_lifecycle_email_steps directly (SA-022)';
  end if;
  raise notice 'PASS E service_role (not anon) may execute the held predicate; API roles cannot seed steps';
end $$;

rollback;
