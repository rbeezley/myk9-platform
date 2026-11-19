-- MYK9-2001: pulling out, money. Executes the INSTALLED functions and triggers from
-- 20261120053700_myk9_2001_pull_out_money_emails.sql (never a source-string contract).
--
--   A. Deny refund needs a reason: blank, spaces only and over-long are refused (22023); a real
--      one is trimmed and recorded; a second denial keeps the first reason; a direct write of the
--      reason by a signed-in user is refused; reinstating the entry clears it
--   B. the exhibitor's OWN Pull queues one held, automatic pulled_out job; her second pull in the
--      same sitting joins it (one email per person per show) and waits again
--   C. a secretary's Pull queues no pulled_out job (entry_changed tells that, once); a codeless
--      withdrawal (a secretary removal) and a change with no acting user queue none; an
--      exhibitor's Withdraw WITH a reason code does
--   D. an unpublished show queues nothing
--   E. a denial queues one refund_outcome event; a recorded refund queues another; both join the
--      one waiting job; a refund on an entry still running queues nothing
--   F. a job the drain has claimed is frozen: the next event is a new job
--   G. the producer function is not callable by an API role
--
-- Fixtures roll back.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002001001', 'MYK9-2001 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002001002', 'MYK9-2001 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002001001', 'published'),
  ('00000000-0000-0000-0000-000002001012', 'MYK9-2001 Draft Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002001001', 'draft');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002001003', '00000000-0000-0000-0000-000002001002', 'MYK9-2001 Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002001013', '00000000-0000-0000-0000-000002001012', 'MYK9-2001 Draft Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002001004', '00000000-0000-0000-0000-000002001003', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002001014', '00000000-0000-0000-0000-000002001013', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');

insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002001021', 'Ada', 'Owner', 'ada@example.test'),
  ('00000000-0000-0000-0000-000002001026', 'Sue', 'Secretary', 'sue@example.test');
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000002001101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ada@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002001102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sue@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);
update public.people set auth_user_id = '00000000-0000-0000-0000-000002001101'
 where id = '00000000-0000-0000-0000-000002001021';
update public.people set auth_user_id = '00000000-0000-0000-0000-000002001102'
 where id = '00000000-0000-0000-0000-000002001026';

-- Sue is the show's secretary (the tier set_entry_refund_decision authorises).
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000002001026', id, '00000000-0000-0000-0000-000002001001', true,
       '00000000-0000-0000-0000-000002001102'
  from public.roles where name = 'secretary';

insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002001031', 'Ada Dog One', 'One', 'Beagle', '00000000-0000-0000-0000-000002001021'),
  ('00000000-0000-0000-0000-000002001032', 'Ada Dog Two', 'Two', 'Beagle', '00000000-0000-0000-0000-000002001021'),
  ('00000000-0000-0000-0000-000002001033', 'Ada Dog Three', 'Three', 'Beagle', '00000000-0000-0000-0000-000002001021'),
  ('00000000-0000-0000-0000-000002001034', 'Ada Dog Four', 'Four', 'Beagle', '00000000-0000-0000-0000-000002001021'),
  ('00000000-0000-0000-0000-000002001035', 'Ada Dog Five', 'Five', 'Beagle', '00000000-0000-0000-0000-000002001021');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order,
                            check_in_status, payment_method, payment_status, entry_fee) values
  ('00000000-0000-0000-0000-000002001041', '00000000-0000-0000-0000-000002001031', '00000000-0000-0000-0000-000002001004', '00000000-0000-0000-0000-000002001002', '00000000-0000-0000-0000-000002001003', 'confirmed', '1', 1, 'no-status', 'online', 'paid', 30),
  ('00000000-0000-0000-0000-000002001042', '00000000-0000-0000-0000-000002001032', '00000000-0000-0000-0000-000002001004', '00000000-0000-0000-0000-000002001002', '00000000-0000-0000-0000-000002001003', 'confirmed', '2', 2, 'no-status', 'online', 'paid', 30),
  ('00000000-0000-0000-0000-000002001043', '00000000-0000-0000-0000-000002001033', '00000000-0000-0000-0000-000002001004', '00000000-0000-0000-0000-000002001002', '00000000-0000-0000-0000-000002001003', 'confirmed', '3', 3, 'no-status', 'online', 'paid', 30),
  ('00000000-0000-0000-0000-000002001044', '00000000-0000-0000-0000-000002001034', '00000000-0000-0000-0000-000002001004', '00000000-0000-0000-0000-000002001002', '00000000-0000-0000-0000-000002001003', 'confirmed', '4', 4, 'no-status', 'online', 'paid', 30),
  ('00000000-0000-0000-0000-000002001045', '00000000-0000-0000-0000-000002001035', '00000000-0000-0000-0000-000002001004', '00000000-0000-0000-0000-000002001002', '00000000-0000-0000-0000-000002001003', 'confirmed', '5', 5, 'no-status', 'online', 'paid', 30),
  ('00000000-0000-0000-0000-000002001046', '00000000-0000-0000-0000-000002001031', '00000000-0000-0000-0000-000002001014', '00000000-0000-0000-0000-000002001012', '00000000-0000-0000-0000-000002001013', 'confirmed', '1', 1, 'no-status', 'online', 'paid', 30);
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- Act as a signed-in user ('' = nobody: the service role, a cron job).
create or replace function pg_temp.act(p_auth text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth, true);
  perform set_config('request.jwt.claims',
    case when p_auth = '' then '' else json_build_object('sub', p_auth, 'role', 'authenticated')::text end, true);
end $$;

create or replace function pg_temp.jobs(p_show uuid, p_step text, p_status text default null) returns integer
language sql as $$
  select count(*)::integer from public.show_lifecycle_email_jobs
   where show_id = p_show and step_type = p_step
     and (p_status is null or status = p_status or (p_status = 'waiting' and status in ('held', 'ready')))
$$;

create or replace function pg_temp.events(p_step text, p_kind text, p_entry uuid default null) returns integer
language sql as $$
  select count(*)::integer
    from public.show_lifecycle_email_jobs j, jsonb_array_elements(j.entry_changes) ev
   where j.step_type = p_step and j.status in ('held', 'ready')
     and ev->>'kind' = p_kind and (p_entry is null or ev->>'entry_id' = p_entry::text)
$$;

-- B
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002001002';
  v_job record;
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002001101');
  update public.entries set entry_status = 'scratched' where id = '00000000-0000-0000-0000-000002001041';
  if pg_temp.jobs(v_show, 'pulled_out') <> 1 then
    raise exception 'FAIL B expected 1 pulled_out job, found %', pg_temp.jobs(v_show, 'pulled_out');
  end if;
  select * into v_job from public.show_lifecycle_email_jobs where show_id = v_show and step_type = 'pulled_out';
  if v_job.recipient_person_id <> '00000000-0000-0000-0000-000002001021' or v_job.status <> 'held'
     or not v_job.auto_send or v_job.recipient_scope <> 'show_recipient'
     or v_job.due_at <> now() + interval '5 minutes' or v_job.recipient_email <> 'ada@example.test'
     or v_job.entry_changes <> jsonb_build_array(jsonb_build_object(
          'kind', 'removed', 'entry_id', '00000000-0000-0000-0000-000002001041')) then
    raise exception 'FAIL B the job is wrong: %', row_to_json(v_job);
  end if;
  -- No dollar figure and no free text is stored: ids only.
  update public.show_lifecycle_email_jobs set due_at = now() - interval '1 minute'
   where show_id = v_show and step_type = 'pulled_out';
  update public.entries set entry_status = 'scratched' where id = '00000000-0000-0000-0000-000002001042';
  if pg_temp.jobs(v_show, 'pulled_out') <> 1
     or (select jsonb_array_length(entry_changes) from public.show_lifecycle_email_jobs
          where show_id = v_show and step_type = 'pulled_out') <> 2
     or (select due_at from public.show_lifecycle_email_jobs
          where show_id = v_show and step_type = 'pulled_out') <> now() + interval '5 minutes' then
    raise exception 'FAIL B the second pull should join the one job and push its due time out';
  end if;
  raise notice 'PASS B an exhibitor''s own Pulls are one held job per person and wait again';
end $$;

-- C
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002001002';
begin
  -- A secretary's Pull: told by entry_changed (MYK9-2126), not here.
  perform pg_temp.act('00000000-0000-0000-0000-000002001102');
  update public.entries set entry_status = 'scratched' where id = '00000000-0000-0000-0000-000002001043';
  if pg_temp.events('pulled_out', 'removed', '00000000-0000-0000-0000-000002001043') <> 0 then
    raise exception 'FAIL C a secretary''s Pull queued a pulled_out event';
  end if;
  if pg_temp.events('entry_changed', 'pulled', '00000000-0000-0000-0000-000002001043') <> 1 then
    raise exception 'FAIL C a secretary''s Pull should still be told once by entry_changed';
  end if;
  -- A secretary removal (withdrawn, no reason code).
  update public.entries set entry_status = 'withdrawn' where id = '00000000-0000-0000-0000-000002001044';
  -- No acting user.
  perform pg_temp.act('');
  update public.entries set entry_status = 'scratched' where id = '00000000-0000-0000-0000-000002001045';
  if pg_temp.events('pulled_out', 'removed', '00000000-0000-0000-0000-000002001044') <> 0
     or pg_temp.events('pulled_out', 'removed', '00000000-0000-0000-0000-000002001045') <> 0 then
    raise exception 'FAIL C a codeless removal, or a change with no actor, queued an event';
  end if;
  -- The exhibitor's Withdraw WITH a reason code is told.
  update public.entries set entry_status = 'confirmed' where id = '00000000-0000-0000-0000-000002001044';
  perform pg_temp.act('00000000-0000-0000-0000-000002001101');
  update public.entries set entry_status = 'withdrawn', withdrawal_reason_code = 'in_season'
   where id = '00000000-0000-0000-0000-000002001044';
  if pg_temp.events('pulled_out', 'removed', '00000000-0000-0000-0000-000002001044') <> 1 then
    raise exception 'FAIL C an exhibitor''s coded Withdraw queued no event';
  end if;
  raise notice 'PASS C only the exhibitor''s own Pull or coded Withdraw is told here';
end $$;

-- D
do $$
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002001101');
  update public.entries set entry_status = 'scratched' where id = '00000000-0000-0000-0000-000002001046';
  if pg_temp.jobs('00000000-0000-0000-0000-000002001012', 'pulled_out') <> 0 then
    raise exception 'FAIL D an unpublished show queued a job';
  end if;
  raise notice 'PASS D an unpublished show queues nothing';
end $$;

-- A: Deny refund needs a reason.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002001102', true);
do $$
declare
  v_entry uuid := '00000000-0000-0000-0000-000002001041';
begin
  begin
    perform public.set_entry_refund_decision(v_entry, 'denied', '');
    raise exception 'FAIL A a blank reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_entry_refund_decision(v_entry, 'denied', '   ');
    raise exception 'FAIL A a reason of spaces was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_entry_refund_decision(v_entry, 'denied', null);
    raise exception 'FAIL A a null reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_entry_refund_decision(v_entry, 'denied', repeat('x', 301));
    raise exception 'FAIL A an over-long reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS A a blank, spaces-only, null or over-long reason is refused';
end $$;
select public.set_entry_refund_decision('00000000-0000-0000-0000-000002001041', 'denied', '  Pulled after the closing date.  ');
select public.set_entry_refund_decision('00000000-0000-0000-0000-000002001041', 'denied', 'A different reason');
do $$
begin
  begin
    update public.entries set refund_decision_reason = 'sneaky'
     where id = '00000000-0000-0000-0000-000002001042';
    raise exception 'FAIL A a direct write of the reason was accepted';
  exception when insufficient_privilege then
    raise notice 'PASS A a direct write of the reason is refused';
  end;
end $$;
reset role;

do $$
declare
  r record;
begin
  select refund_decision, refund_decision_reason, refund_decided_at into r
    from public.entries where id = '00000000-0000-0000-0000-000002001041';
  if r.refund_decision <> 'denied' or r.refund_decided_at is null
     or r.refund_decision_reason <> 'Pulled after the closing date.' then
    raise exception 'FAIL A the denial should keep the FIRST trimmed reason, found %', row_to_json(r);
  end if;
  raise notice 'PASS A the reason is trimmed, recorded, and the first one stands';
end $$;

-- E
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002001002';
  v_job record;
begin
  if pg_temp.jobs(v_show, 'refund_outcome') <> 1
     or pg_temp.events('refund_outcome', 'denied', '00000000-0000-0000-0000-000002001041') <> 1 then
    raise exception 'FAIL E the denial should queue exactly one denied event';
  end if;
  -- A refund recorded on the other pulled entry, as the payment service writes it.
  update public.entries set refund_amount = 30, refunded_at = now()
   where id = '00000000-0000-0000-0000-000002001042';
  if pg_temp.jobs(v_show, 'refund_outcome') <> 1
     or pg_temp.events('refund_outcome', 'refunded', '00000000-0000-0000-0000-000002001042') <> 1 then
    raise exception 'FAIL E a recorded refund should join the one waiting job';
  end if;
  select * into v_job from public.show_lifecycle_email_jobs where show_id = v_show and step_type = 'refund_outcome';
  if v_job.status <> 'held' or not v_job.auto_send or v_job.recipient_person_id <> '00000000-0000-0000-0000-000002001021' then
    raise exception 'FAIL E the job is wrong: %', row_to_json(v_job);
  end if;
  -- A refund on an entry still running is no outcome of a pull.
  update public.entries set entry_status = 'confirmed' where id = '00000000-0000-0000-0000-000002001045';
  update public.entries set refund_amount = 10 where id = '00000000-0000-0000-0000-000002001045';
  if pg_temp.events('refund_outcome', 'refunded', '00000000-0000-0000-0000-000002001045') <> 0 then
    raise exception 'FAIL E a refund on a running entry queued an event';
  end if;
  raise notice 'PASS E a denial and a recorded refund are told once, in one job';
end $$;

-- A (continued): reinstating the entry clears the reason.
do $$
begin
  update public.entries set entry_status = 'confirmed' where id = '00000000-0000-0000-0000-000002001041';
  if (select refund_decision_reason from public.entries where id = '00000000-0000-0000-0000-000002001041') is not null
     or (select refund_decision from public.entries where id = '00000000-0000-0000-0000-000002001041') is not null then
    raise exception 'FAIL A reinstating the entry should clear the decision and its reason';
  end if;
  raise notice 'PASS A reinstating the entry clears the reason';
end $$;

-- F
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002001002';
  v_before integer;
begin
  update public.show_lifecycle_email_jobs
     set claimed_until = now() + interval '10 minutes', attempt_id = gen_random_uuid()
   where show_id = v_show and step_type = 'refund_outcome';
  select count(*) into v_before from public.show_lifecycle_email_jobs
   where show_id = v_show and step_type = 'refund_outcome';
  perform pg_temp.act('00000000-0000-0000-0000-000002001102');
  update public.entries set entry_status = 'scratched', refund_amount = null where id = '00000000-0000-0000-0000-000002001043';
  update public.entries set refund_amount = 5 where id = '00000000-0000-0000-0000-000002001043';
  if (select count(*) from public.show_lifecycle_email_jobs
       where show_id = v_show and step_type = 'refund_outcome') <> v_before + 1 then
    raise exception 'FAIL F a claimed job must be frozen: the next event is a new job';
  end if;
  raise notice 'PASS F a claimed job is frozen';
end $$;

-- G
do $$
begin
  begin
    set local role authenticated;
    perform public.queue_entry_money_email('00000000-0000-0000-0000-000002001041', 'pulled_out', '{}'::jsonb);
    raise exception 'FAIL G an API role called the producer';
  exception when insufficient_privilege then
    reset role;
    raise notice 'PASS G the producer is not callable by an API role';
  end;
end $$;

-- H: the step_type CHECKs accept every step type on main (this migration sorts BEFORE 2127's in
-- file order if re-applied with --include-all, so it must carry show_cancelled itself)
do $$
declare
  v_step text;
  v_show constant uuid := '00000000-0000-0000-0000-000002001012';
begin
  delete from public.show_lifecycle_email_steps where show_id = v_show;
  foreach v_step in array array['show_cancelled', 'pulled_out', 'refund_outcome'] loop
    insert into public.show_lifecycle_email_steps (show_id, step_type, is_enabled) values (v_show, v_step, true);
  end loop;
  delete from public.show_lifecycle_email_steps where show_id = v_show;
  perform public.ensure_show_lifecycle_email_steps(v_show);
  if (select count(*) from public.show_lifecycle_email_steps
       where show_id = v_show
         and step_type in ('show_cancelled', 'pulled_out', 'refund_outcome')) <> 3 then
    raise exception 'FAIL H ensure_show_lifecycle_email_steps should seed show_cancelled, pulled_out and refund_outcome';
  end if;
  begin
    insert into public.show_lifecycle_email_steps (show_id, step_type, is_enabled) values (v_show, 'not_a_step', true);
    raise exception 'FAIL H the steps CHECK accepted an unknown step type';
  exception when check_violation then
    null;
  end;
  foreach v_step in array array['show_cancelled', 'pulled_out', 'refund_outcome', 'not_a_step'] loop
    begin
      insert into public.show_lifecycle_email_jobs (
        show_id, step_id, step_type, status, recipient_scope, recipient_person_id,
        recipient_email, recipient_name, subject, idempotency_key, due_at, auto_send)
      select v_show, id, v_step, 'held', 'show_recipient', '00000000-0000-0000-0000-000002001021',
             'ada@example.test', 'Ada Owner', 'H check', 'h-check-' || v_step, now(), true
        from public.show_lifecycle_email_steps where show_id = v_show limit 1;
      if v_step = 'not_a_step' then
        raise exception 'FAIL H the jobs CHECK accepted an unknown step type';
      end if;
    exception when check_violation then
      if v_step <> 'not_a_step' then
        raise exception 'FAIL H the jobs CHECK refused %', v_step;
      end if;
    end;
  end loop;
  raise notice 'PASS H both CHECKs accept show_cancelled, pulled_out and refund_outcome, and refuse others';
end $$;

-- I: NULLing refund_decision while a reason is set breaks entries_refund_decision_reason_check
-- (a reason belongs to a denial); written as the owner role, so only the CHECK can refuse it
do $$
begin
  update public.entries
     set refund_decision = 'denied', refund_decision_reason = 'Late pull'
   where id = '00000000-0000-0000-0000-000002001042';
  begin
    update public.entries set refund_decision = null where id = '00000000-0000-0000-0000-000002001042';
    raise exception 'FAIL I a reason with no denial was accepted';
  exception when check_violation then
    raise notice 'PASS I NULLing refund_decision while a reason is set is refused by the CHECK';
  end;
end $$;

rollback;
