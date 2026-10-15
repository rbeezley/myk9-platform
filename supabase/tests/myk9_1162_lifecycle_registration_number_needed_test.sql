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
--   F. one waiting or failed registration_number_needed email per entry; a sent
--      one does not block the next reminder, and other steps are unaffected
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

-- F needs a real entry (entry_id references entries). The fixture owner has no
-- caller identity, so the no-number entry trigger is off for this insert only.
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000001162303', '00000000-0000-0000-0000-000001162302',
   'MYK9-1162 Lifecycle Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000001162304', '00000000-0000-0000-0000-000001162303',
   'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');
insert into public.dogs (id, name, call_name, breed) values
  ('00000000-0000-0000-0000-000001162305', 'MYK9-1162 Lifecycle Dog', 'Life', 'Beagle');
alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000001162306', '00000000-0000-0000-0000-000001162305',
   '00000000-0000-0000-0000-000001162304', '00000000-0000-0000-0000-000001162302',
   '00000000-0000-0000-0000-000001162303', 'confirmed', '1', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

do $$
declare
  v_step uuid;
  v_other_step uuid;
  v_entry uuid := '00000000-0000-0000-0000-000001162306';
begin
  select id into v_step from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001162302' and step_type = 'registration_number_needed';
  select id into v_other_step from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001162302' and step_type = 'accepted';

  insert into public.show_lifecycle_email_jobs
    (show_id, step_id, step_type, recipient_scope, entry_id, recipient_email, idempotency_key, status)
  values
    ('00000000-0000-0000-0000-000001162302', v_step, 'registration_number_needed', 'entry', v_entry,
     'a@example.test', 'myk9-1162-f-1', 'failed');

  begin
    insert into public.show_lifecycle_email_jobs
      (show_id, step_id, step_type, recipient_scope, entry_id, recipient_email, idempotency_key)
    values
      ('00000000-0000-0000-0000-000001162302', v_step, 'registration_number_needed', 'entry', v_entry,
       'a@example.test', 'myk9-1162-f-2');
    raise exception 'FAIL F a second outstanding registration_number_needed email was accepted';
  exception when unique_violation then null;
  end;

  -- Once the first is sent, the next reminder may be saved.
  update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now()
   where idempotency_key = 'myk9-1162-f-1';
  insert into public.show_lifecycle_email_jobs
    (show_id, step_id, step_type, recipient_scope, entry_id, recipient_email, idempotency_key)
  values
    ('00000000-0000-0000-0000-000001162302', v_step, 'registration_number_needed', 'entry', v_entry,
     'a@example.test', 'myk9-1162-f-3');

  -- Other steps are not limited.
  insert into public.show_lifecycle_email_jobs
    (show_id, step_id, step_type, recipient_scope, entry_id, recipient_email, idempotency_key)
  values
    ('00000000-0000-0000-0000-000001162302', v_other_step, 'accepted', 'entry', v_entry,
     'a@example.test', 'myk9-1162-f-4'),
    ('00000000-0000-0000-0000-000001162302', v_other_step, 'accepted', 'entry', v_entry,
     'a@example.test', 'myk9-1162-f-5');
  raise notice 'PASS F one outstanding registration_number_needed email per entry';
end $$;

rollback;
