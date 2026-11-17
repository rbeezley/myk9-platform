-- MYK9-2088: the full confirmation rides the automatic job queue (show_lifecycle_email_jobs).
--
--   A. an entry_confirmation job is accepted by the step_type CHECK and keeps its entry ids,
--      group key and stored text
--   B. one READY job per exhibitor per show: a second ready job for the same group is
--      refused, another group is fine, and once the first is sent a new one is allowed
--   C. the claim takes only the step types it is given (no default), leases the job, hands
--      an expired lease out again with a new attempt (an interrupted send is recoverable),
--      and never takes a sent, non-automatic or not-yet-due job
--   D. the claim returns what the drain needs to send without rendering
--   F. Delivery history lists a confirmation job only when the JOB ended failed, once, and a
--      refused-then-sent job lists no failure; another step type's failed attempts still list
--   E. the claim is service_role only, the old two-argument claim is gone, and an API role
--      cannot write entry_ids
--
--   G. mark_entry_confirmation stamps an entry only while its CURRENT acceptance generation is the
--      covered one, never clears a sent marker, and is service_role only
--   H. the two-argument claim (rollout window) takes show_changed jobs only
--
-- Fixtures roll back. Every now() below is the transaction start, so times compare exactly.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002088301', 'MYK9-2088 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002088302', 'MYK9-2088 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002088301', 'published');

create or replace function pg_temp.add_job(
  p_batch_key text,
  p_step_type text,
  p_key text,
  p_auto boolean default true,
  p_due timestamptz default now() - interval '1 minute'
) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, status, recipient_scope, recipient_email, recipient_name,
    subject, rendered_subject, rendered_body, idempotency_key, batch_key, entry_ids, due_at, auto_send
  )
  select s.show_id, s.id, p_step_type, 'ready', 'show_recipient', 'ada@example.test', 'Ada',
         'Your entry is accepted', 'Your entry is accepted', '<p>Armband 101</p>', p_key, p_batch_key,
         array['00000000-0000-0000-0000-000002088341', '00000000-0000-0000-0000-000002088342']::uuid[],
         p_due, p_auto
    from public.show_lifecycle_email_steps s
   where s.show_id = '00000000-0000-0000-0000-000002088302' and s.step_type = 'accepted'
  returning id into v_id;
  return v_id;
end $$;

-- A
do $$
declare
  v_job uuid;
  v_row record;
begin
  v_job := pg_temp.add_job('00000000-0000-0000-0000-000002088302:registration:reg-ada', 'entry_confirmation', 'entry-confirmation:a');
  select * into v_row from public.show_lifecycle_email_jobs where id = v_job;
  if v_row.step_type <> 'entry_confirmation' or array_length(v_row.entry_ids, 1) <> 2
     or v_row.rendered_body <> '<p>Armband 101</p>' then
    raise exception 'FAIL A the confirmation job is wrong: %', row_to_json(v_row);
  end if;
  raise notice 'PASS A an entry_confirmation job is accepted and keeps its entry ids and text';
end $$;

-- B
do $$
declare
  v_first uuid;
begin
  begin
    perform pg_temp.add_job('00000000-0000-0000-0000-000002088302:registration:reg-ada', 'entry_confirmation', 'entry-confirmation:b-duplicate');
    raise exception 'FAIL B a second ready job for the same exhibitor and show was allowed';
  exception when unique_violation then
    null;
  end;
  perform pg_temp.add_job('00000000-0000-0000-0000-000002088302:registration:reg-bea', 'entry_confirmation', 'entry-confirmation:b-bea');

  select id into v_first from public.show_lifecycle_email_jobs where idempotency_key = 'entry-confirmation:a';
  update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now() where id = v_first;
  perform pg_temp.add_job('00000000-0000-0000-0000-000002088302:registration:reg-ada', 'entry_confirmation', 'entry-confirmation:b-later');
  raise notice 'PASS B one ready job per exhibitor per show; a sent job frees the slot';
end $$;

-- C and D
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002088302';
  v_changed uuid;
  v_not_auto uuid;
  v_future uuid;
  v_first record;
  v_count integer;
  v_again record;
begin
  -- Ready now: bea's and ada's later job. Add other kinds that must never be taken.
  v_changed := pg_temp.add_job(null, 'show_changed', 'show-changed:c');
  v_not_auto := pg_temp.add_job('00000000-0000-0000-0000-000002088302:registration:reg-cy', 'entry_confirmation', 'entry-confirmation:c-manual', false);
  v_future := pg_temp.add_job('00000000-0000-0000-0000-000002088302:registration:reg-dee', 'entry_confirmation', 'entry-confirmation:c-future', true, now() + interval '5 minutes');

  select count(*) into v_count from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes', null);
  if v_count <> 0 then
    raise exception 'FAIL C a claim with no step types took % jobs', v_count;
  end if;
  select count(*) into v_count from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes', array['results_available']);
  if v_count <> 0 then
    raise exception 'FAIL C a claim for another step type took % jobs', v_count;
  end if;

  select * into v_first from public.claim_due_auto_email_jobs(1, now() + interval '10 minutes', array['entry_confirmation']);
  if v_first.step_type <> 'entry_confirmation' or v_first.attempt_id is null
     or v_first.recipient_email <> 'ada@example.test' or v_first.rendered_subject <> 'Your entry is accepted'
     or v_first.rendered_body <> '<p>Armband 101</p>' or array_length(v_first.entry_ids, 1) <> 2
     or v_first.batch_key is null then
    raise exception 'FAIL D the claim did not return what the drain sends: %', row_to_json(v_first);
  end if;
  if exists (select 1 from public.show_lifecycle_email_jobs
              where id in (v_changed, v_not_auto, v_future) and (attempt_id is not null or claimed_until is not null)) then
    raise exception 'FAIL C the claim leased a show_changed, non-automatic or not-yet-due job';
  end if;

  -- Leased: a second claim takes the other ready confirmation, never the leased one.
  select count(*) into v_count from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes', array['entry_confirmation']);
  if v_count <> 1 then
    raise exception 'FAIL C the second claim should take only the other free job, took %', v_count;
  end if;
  select count(*) into v_count from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes', array['entry_confirmation']);
  if v_count <> 0 then
    raise exception 'FAIL C a live lease was handed out again (% jobs)', v_count;
  end if;

  -- The function stopped after the claim: its lease runs out and the next run takes the job.
  update public.show_lifecycle_email_jobs set claimed_until = now() - interval '1 minute' where id = v_first.job_id;
  select * into v_again from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes', array['entry_confirmation']);
  if v_again.job_id is distinct from v_first.job_id or v_again.attempt_id is not distinct from v_first.attempt_id then
    raise exception 'FAIL C an expired lease was not handed out with a new attempt: %', row_to_json(v_again);
  end if;

  -- A sent job is never claimed again.
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = v_show and step_type = 'entry_confirmation' and auto_send and due_at <= now();
  select count(*) into v_count from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes', array['entry_confirmation']);
  if v_count <> 0 then
    raise exception 'FAIL C a sent job was claimed again (% jobs)', v_count;
  end if;
  raise notice 'PASS C and D the claim is per step type, leased, recoverable after an expired lease and returns the stored email';
end $$;

-- E
do $$
begin
  if has_function_privilege('authenticated', 'public.claim_due_auto_email_jobs(integer, timestamptz, text[])', 'execute')
     or has_function_privilege('anon', 'public.claim_due_auto_email_jobs(integer, timestamptz, text[])', 'execute') then
    raise exception 'FAIL E an API role can run the claim';
  end if;
  if not has_function_privilege('service_role', 'public.claim_due_auto_email_jobs(integer, timestamptz, text[])', 'execute') then
    raise exception 'FAIL E service_role cannot run the claim';
  end if;
  -- The two-argument claim stays for the rollout window, but only as a show_changed claim.
  if to_regprocedure('public.claim_due_auto_email_jobs(integer, timestamptz)') is null then
    raise exception 'FAIL E the rollout wrapper claim is missing';
  end if;
  if has_function_privilege('authenticated', 'public.claim_due_auto_email_jobs(integer, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.claim_due_auto_email_jobs(integer, timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.claim_due_auto_email_jobs(integer, timestamptz)', 'execute') then
    raise exception 'FAIL E the rollout wrapper claim is not service_role only';
  end if;
  if has_column_privilege('authenticated', 'public.show_lifecycle_email_jobs', 'entry_ids', 'update')
     or has_column_privilege('anon', 'public.show_lifecycle_email_jobs', 'entry_ids', 'update') then
    raise exception 'FAIL E an API role can write entry_ids';
  end if;
  raise notice 'PASS E the claim is service_role only and entry_ids is server-written';
end $$;

-- F
insert into public.people (id, first_name, last_name, email, auth_user_id) values
  ('00000000-0000-0000-0000-000002088411', 'MYK9-2088', 'Admin', 'myk9-2088-admin@example.test', null);
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000002088401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'myk9-2088-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false
);
insert into public.user_roles (user_id, role_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000002088411', r.id, true, '00000000-0000-0000-0000-000002088401'
  from public.roles r where r.name = 'site_admin';

do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002088302';
  v_step uuid;
  v_waiting uuid := '00000000-0000-0000-0000-000002088501';
  v_retried uuid := '00000000-0000-0000-0000-000002088502';
  v_failed uuid := '00000000-0000-0000-0000-000002088503';
  v_other uuid := '00000000-0000-0000-0000-000002088504';
  v_count integer;
begin
  select id into v_step from public.show_lifecycle_email_steps where show_id = v_show and step_type = 'accepted';
  insert into public.show_lifecycle_email_jobs (id, show_id, step_id, step_type, status, recipient_scope,
    recipient_email, recipient_name, idempotency_key, batch_key, due_at, auto_send, sent_at)
  values
    (v_waiting, v_show, v_step, 'entry_confirmation', 'ready', 'show_recipient', 'a@example.test', 'Waiting', 'f-waiting', 'f:waiting', now(), true, null),
    (v_retried, v_show, v_step, 'entry_confirmation', 'sent', 'show_recipient', 'b@example.test', 'Retried', 'f-retried', 'f:retried', now(), true, now()),
    (v_failed, v_show, v_step, 'entry_confirmation', 'failed', 'show_recipient', 'c@example.test', 'Failed', 'f-failed', 'f:failed', now(), true, null),
    (v_other, v_show, v_step, 'accepted', 'failed', 'show_recipient', 'd@example.test', 'Other', 'f-other', null, now(), false, null);
  insert into public.show_lifecycle_email_attempts (job_id, status, error_message, attempted_at) values
    (v_waiting, 'failed', 'provider_http_500', now() - interval '3 minutes'),
    (v_retried, 'failed', 'provider_http_500', now() - interval '3 minutes'),
    (v_retried, 'sent', null, now() - interval '2 minutes'),
    (v_failed, 'failed', 'provider_http_500', now() - interval '3 minutes'),
    (v_failed, 'failed', 'provider_http_500', now() - interval '2 minutes'),
    (v_failed, 'failed', 'provider_http_500', now() - interval '1 minute'),
    (v_other, 'failed', 'provider_http_500', now() - interval '3 minutes'),
    (v_other, 'failed', 'provider_http_500', now() - interval '2 minutes');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002088401', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000002088401', 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.get_show_email_delivery_history(v_show, 100, null, null)
   where related_id in (v_waiting, v_retried);
  if v_count <> 0 then
    raise exception 'FAIL F a waiting or refused-then-sent confirmation listed % failure lines', v_count;
  end if;
  select count(*) into v_count from public.get_show_email_delivery_history(v_show, 100, null, null)
   where related_id = v_failed and lifecycle_step_type = 'entry_confirmation' and delivery_status = 'failed';
  if v_count <> 1 then
    raise exception 'FAIL F a confirmation that ended failed should list exactly one line, listed %', v_count;
  end if;
  select count(*) into v_count from public.get_show_email_delivery_history(v_show, 100, null, null)
   where related_id = v_other;
  if v_count <> 2 then
    raise exception 'FAIL F another step type must still list each failed attempt (2), listed %', v_count;
  end if;
  reset role;
  raise notice 'PASS F Delivery history lists a confirmation only when the job ended failed, once';
end $$;

-- G and H
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002088603', '00000000-0000-0000-0000-000002088302', 'MYK9-2088 Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002088604', '00000000-0000-0000-0000-000002088603', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');
insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002088621', 'Ada', 'Owner', 'ada2088@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002088631', 'Dog One', 'One', 'Beagle', '00000000-0000-0000-0000-000002088621'),
  ('00000000-0000-0000-0000-000002088632', 'Dog Two', 'Two', 'Beagle', '00000000-0000-0000-0000-000002088621'),
  ('00000000-0000-0000-0000-000002088633', 'Dog Three', 'Three', 'Beagle', '00000000-0000-0000-0000-000002088621');
alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002088641', '00000000-0000-0000-0000-000002088631', '00000000-0000-0000-0000-000002088604', '00000000-0000-0000-0000-000002088302', '00000000-0000-0000-0000-000002088603', 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002088642', '00000000-0000-0000-0000-000002088632', '00000000-0000-0000-0000-000002088604', '00000000-0000-0000-0000-000002088302', '00000000-0000-0000-0000-000002088603', 'confirmed', '2', 2, 'no-status'),
  ('00000000-0000-0000-0000-000002088643', '00000000-0000-0000-0000-000002088633', '00000000-0000-0000-0000-000002088604', '00000000-0000-0000-0000-000002088302', '00000000-0000-0000-0000-000002088603', 'confirmed', '3', 3, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;
delete from public.entry_status_history
 where entry_id in ('00000000-0000-0000-0000-000002088641', '00000000-0000-0000-0000-000002088642', '00000000-0000-0000-0000-000002088643');
insert into public.entry_status_history (id, entry_id, previous_status, new_status, changed_at) values
  ('00000000-0000-0000-0000-000002088701', '00000000-0000-0000-0000-000002088641', 'paid', 'confirmed', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000002088702', '00000000-0000-0000-0000-000002088642', 'paid', 'confirmed', now() - interval '2 hours');

do $$
declare
  e1 uuid := '00000000-0000-0000-0000-000002088641';
  e2 uuid := '00000000-0000-0000-0000-000002088642';
  e3 uuid := '00000000-0000-0000-0000-000002088643';
  v_count integer;
  v_row record;
begin
  -- The covered generation must match: e1 does, e2 is told a stale one, e3 has none.
  v_count := public.mark_entry_confirmation(
    jsonb_build_object(e1::text, '00000000-0000-0000-0000-000002088701', e2::text, '00000000-0000-0000-0000-0000000000ff', e3::text, 'none'),
    'sent', 'msg-1', now());
  if v_count <> 2 then
    raise exception 'FAIL G expected e1 and e3 stamped, % rows changed', v_count;
  end if;
  if (select confirmation_email_sent_at is null from public.entries where id = e2) is not true then
    raise exception 'FAIL G an entry whose generation did not match was stamped';
  end if;

  -- A failure never clears a sent marker, and touches no entry already stamped.
  v_count := public.mark_entry_confirmation(
    jsonb_build_object(e1::text, '00000000-0000-0000-0000-000002088701'), 'failed', null, now());
  select * into v_row from public.entries where id = e1;
  if v_count <> 0 or v_row.confirmation_email_sent_at is null or v_row.confirmation_email_status <> 'sent'
     or v_row.confirmation_email_message_id <> 'msg-1' then
    raise exception 'FAIL G a failure changed a sent marker: %', row_to_json(v_row);
  end if;

  -- Accepted again (a newer history row): the earlier acceptance's job no longer stamps e2.
  insert into public.entry_status_history (id, entry_id, previous_status, new_status, changed_at)
  values ('00000000-0000-0000-0000-000002088703', e2, 'paid', 'confirmed', now() - interval '1 hour');
  v_count := public.mark_entry_confirmation(
    jsonb_build_object(e2::text, '00000000-0000-0000-0000-000002088702'), 'sent', 'msg-old', now());
  if v_count <> 0 or (select confirmation_email_sent_at is not null from public.entries where id = e2) then
    raise exception 'FAIL G the earlier acceptance stamped a re-accepted entry';
  end if;
  v_count := public.mark_entry_confirmation(
    jsonb_build_object(e2::text, '00000000-0000-0000-0000-000002088703'), 'sent', 'msg-new', now());
  if v_count <> 1 then
    raise exception 'FAIL G the current acceptance was not stamped';
  end if;

  if has_function_privilege('authenticated', 'public.mark_entry_confirmation(jsonb, text, text, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.mark_entry_confirmation(jsonb, text, text, timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.mark_entry_confirmation(jsonb, text, text, timestamptz)', 'execute') then
    raise exception 'FAIL G mark_entry_confirmation is not service_role only';
  end if;
  raise notice 'PASS G the marker is fenced by acceptance generation and a failure never clears it';
end $$;

do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002088302';
  v_count integer;
  v_all_changed boolean;
begin
  perform pg_temp.add_job('00000000-0000-0000-0000-000002088302:registration:reg-h1', 'entry_confirmation', 'entry-confirmation:h');
  perform pg_temp.add_job(null, 'show_changed', 'show-changed:h');
  select count(*), bool_and(step_type = 'show_changed') into v_count, v_all_changed
    from public.claim_due_auto_email_jobs(10, now() + interval '10 minutes');
  if v_count < 1 or v_all_changed is not true then
    raise exception 'FAIL H the two-argument claim took % jobs, expected only show_changed ones', v_count;
  end if;
  raise notice 'PASS H the rollout wrapper claim takes show_changed jobs only';
end $$;

rollback;
