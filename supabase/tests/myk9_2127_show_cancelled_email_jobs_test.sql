-- MYK9-2127: cancelling a published show queues one automatic email per exhibitor, once.
--
--   A. published to cancelled queues one held, automatic job per person with an entry still
--      standing (owner, handler, a pending-payment waitlist offer; never a withdrawn or pulled dog's owner)
--   B. saving the show again while cancelled, or cancelling again after a reopen, queues nothing
--   C. a draft that is cancelled queues nothing
--   D. a job that was skipped (reopened before it went out) is revived by the next cancel; a
--      sent job is left alone
--   E. the send-time check (show_person_has_live_entry): an exhibitor with an entry, pending-payment
--      included, is true; a withdrawn or pulled one is false
--   F. both step_type CHECKs accept show_cancelled; the functions are not callable by an API role
--
-- Fixtures roll back. Every now() below is the transaction start, so due times compare exactly.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002127301', 'MYK9-2127 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002127302', 'MYK9-2127 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002127301', 'published'),
  ('00000000-0000-0000-0000-000002127312', 'MYK9-2127 Draft Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002127301', 'draft');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002127303', '00000000-0000-0000-0000-000002127302', 'MYK9-2127 Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002127313', '00000000-0000-0000-0000-000002127312', 'MYK9-2127 Draft Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002127304', '00000000-0000-0000-0000-000002127303', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002127314', '00000000-0000-0000-0000-000002127313', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');

insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002127321', 'Ada', 'Owner', 'ada@example.test'),
  ('00000000-0000-0000-0000-000002127325', 'Hal', 'Handler', 'hal@example.test'),
  ('00000000-0000-0000-0000-000002127326', 'Cy', 'Withdrew', 'cy@example.test'),
  ('00000000-0000-0000-0000-000002127327', 'Pat', 'Pulled', 'pat@example.test'),
  ('00000000-0000-0000-0000-000002127328', 'Wyn', 'Waitlist', 'wyn@example.test');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002127331', 'Ada Dog One', 'One', 'Beagle', '00000000-0000-0000-0000-000002127321'),
  ('00000000-0000-0000-0000-000002127332', 'Ada Dog Two', 'Two', 'Beagle', '00000000-0000-0000-0000-000002127321'),
  ('00000000-0000-0000-0000-000002127334', 'Cy Dog', 'Cy', 'Beagle', '00000000-0000-0000-0000-000002127326'),
  ('00000000-0000-0000-0000-000002127335', 'Pat Dog', 'Pat', 'Beagle', '00000000-0000-0000-0000-000002127327'),
  ('00000000-0000-0000-0000-000002127336', 'Wyn Dog', 'Wyn', 'Beagle', '00000000-0000-0000-0000-000002127328');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002127341', '00000000-0000-0000-0000-000002127331', '00000000-0000-0000-0000-000002127304', '00000000-0000-0000-0000-000002127302', '00000000-0000-0000-0000-000002127303', null, 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002127342', '00000000-0000-0000-0000-000002127332', '00000000-0000-0000-0000-000002127304', '00000000-0000-0000-0000-000002127302', '00000000-0000-0000-0000-000002127303', '00000000-0000-0000-0000-000002127325', 'confirmed', '2', 2, 'no-status'),
  ('00000000-0000-0000-0000-000002127344', '00000000-0000-0000-0000-000002127334', '00000000-0000-0000-0000-000002127304', '00000000-0000-0000-0000-000002127302', '00000000-0000-0000-0000-000002127303', null, 'withdrawn', '4', 3, 'no-status'),
  ('00000000-0000-0000-0000-000002127347', '00000000-0000-0000-0000-000002127335', '00000000-0000-0000-0000-000002127304', '00000000-0000-0000-0000-000002127302', '00000000-0000-0000-0000-000002127303', null, 'confirmed', '5', 4, 'pulled'),
  ('00000000-0000-0000-0000-000002127348', '00000000-0000-0000-0000-000002127336', '00000000-0000-0000-0000-000002127304', '00000000-0000-0000-0000-000002127302', '00000000-0000-0000-0000-000002127303', null, 'pending-payment', '6', 5, 'no-status'),
  ('00000000-0000-0000-0000-000002127345', '00000000-0000-0000-0000-000002127331', '00000000-0000-0000-0000-000002127314', '00000000-0000-0000-0000-000002127312', '00000000-0000-0000-0000-000002127313', null, 'confirmed', '1', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

create or replace function pg_temp.jobs(p_show uuid, p_status text default null) returns integer
language sql as $$
  select count(*)::integer from public.show_lifecycle_email_jobs
   where show_id = p_show and step_type = 'show_cancelled' and (p_status is null or status = p_status)
$$;

-- A
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002127302';
  v_job record;
begin
  update public.shows set status = 'cancelled' where id = v_show;
  if pg_temp.jobs(v_show) <> 3 then
    raise exception 'FAIL A expected 3 jobs (Ada once for two dogs, Hal as handler, Wyn whose waitlist offer awaits payment; Cy withdrew, Pat was pulled), found %', pg_temp.jobs(v_show);
  end if;
  select * into v_job from public.show_lifecycle_email_jobs
   where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002127321';
  if v_job.status <> 'held' or not v_job.auto_send or v_job.recipient_email <> 'ada@example.test'
     or v_job.due_at <> now() + interval '5 minutes' or v_job.recipient_scope <> 'show_recipient'
     or v_job.subject <> 'MYK9-2127 Show has been cancelled'
     or v_job.idempotency_key <> 'show-lifecycle-email:' || v_show::text || ':show_cancelled:person:' || v_job.recipient_person_id::text then
    raise exception 'FAIL A the job is wrong: %', row_to_json(v_job);
  end if;
  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id = v_show and recipient_person_id in
                ('00000000-0000-0000-0000-000002127326', '00000000-0000-0000-0000-000002127327')) then
    raise exception 'FAIL A an exhibitor whose only entry was withdrawn or pulled was queued';
  end if;
  if not exists (select 1 from public.show_lifecycle_email_jobs
                  where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002127328') then
    raise exception 'FAIL A an exhibitor whose entry is pending-payment was not queued';
  end if;
  raise notice 'PASS A a cancel queues one held automatic job per exhibitor with an entry';
end $$;

-- B
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002127302';
begin
  update public.shows set status = 'cancelled', name = 'MYK9-2127 Show (saved again)' where id = v_show;
  if pg_temp.jobs(v_show) <> 3 then
    raise exception 'FAIL B saving a cancelled show again made % jobs', pg_temp.jobs(v_show);
  end if;
  update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now()
   where show_id = v_show and step_type = 'show_cancelled';
  update public.shows set status = 'published' where id = v_show;
  update public.shows set status = 'cancelled' where id = v_show;
  if pg_temp.jobs(v_show) <> 3 or pg_temp.jobs(v_show, 'sent') <> 3 then
    raise exception 'FAIL B cancel, reopen and cancel again after the send made % jobs, % sent',
      pg_temp.jobs(v_show), pg_temp.jobs(v_show, 'sent');
  end if;
  raise notice 'PASS B a repeated cancel sends nothing more';
end $$;

-- C
do $$
declare
  v_draft uuid := '00000000-0000-0000-0000-000002127312';
begin
  update public.shows set status = 'cancelled' where id = v_draft;
  if pg_temp.jobs(v_draft) <> 0 then
    raise exception 'FAIL C a cancelled draft queued % jobs', pg_temp.jobs(v_draft);
  end if;
  raise notice 'PASS C an unpublished show queues nothing';
end $$;

-- D
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002127302';
  v_ada uuid := '00000000-0000-0000-0000-000002127321';
  v_hal uuid := '00000000-0000-0000-0000-000002127325';
begin
  -- Ada's job was skipped (reopened before it went out); Hal's was sent.
  update public.show_lifecycle_email_jobs set status = 'skipped', skipped_at = now()
   where show_id = v_show and recipient_person_id = v_ada and step_type = 'show_cancelled';
  update public.shows set status = 'published' where id = v_show;
  update public.shows set status = 'cancelled' where id = v_show;
  if (select status from public.show_lifecycle_email_jobs where show_id = v_show and recipient_person_id = v_ada and step_type = 'show_cancelled') <> 'held' then
    raise exception 'FAIL D a skipped job was not revived by the next cancel';
  end if;
  if (select status from public.show_lifecycle_email_jobs where show_id = v_show and recipient_person_id = v_hal and step_type = 'show_cancelled') <> 'sent' then
    raise exception 'FAIL D a sent job was changed';
  end if;
  if pg_temp.jobs(v_show) <> 3 then
    raise exception 'FAIL D expected still 3 jobs, found %', pg_temp.jobs(v_show);
  end if;
  raise notice 'PASS D a skipped job is revived, a sent one is left alone';
end $$;

-- D2: cancel, reopen and cancel again inside the quiet window re-times an unclaimed waiting job,
-- and leaves a job a sender has claimed alone.
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002127302';
  v_ada uuid := '00000000-0000-0000-0000-000002127321';
  v_hal uuid := '00000000-0000-0000-0000-000002127325';
  v_claimed_due timestamptz := now() - interval '1 minute';
begin
  -- Ada's job waits out a retry delay: a lease time but no attempt, so it is re-timed.
  update public.show_lifecycle_email_jobs
     set status = 'ready', due_at = now() - interval '3 minutes', attempt_id = NULL,
         claimed_until = now() + interval '2 minutes'
   where show_id = v_show and recipient_person_id = v_ada and step_type = 'show_cancelled';
  -- Hal's job is being sent right now: an attempt and a live lease, so it is left alone.
  update public.show_lifecycle_email_jobs
     set status = 'ready', due_at = v_claimed_due, attempt_id = gen_random_uuid(),
         claimed_until = now() + interval '2 minutes'
   where show_id = v_show and recipient_person_id = v_hal and step_type = 'show_cancelled';
  update public.shows set status = 'published' where id = v_show;
  update public.shows set status = 'cancelled' where id = v_show;
  if (select due_at from public.show_lifecycle_email_jobs where show_id = v_show and recipient_person_id = v_ada and step_type = 'show_cancelled')
     <> now() + interval '5 minutes' then
    raise exception 'FAIL D2 a job in a retry delay was not re-timed by the repeat cancel';
  end if;
  if (select due_at from public.show_lifecycle_email_jobs where show_id = v_show and recipient_person_id = v_hal and step_type = 'show_cancelled')
     <> v_claimed_due then
    raise exception 'FAIL D2 a job being sent was re-timed';
  end if;
  raise notice 'PASS D2 a repeat cancel restarts the quiet window for unclaimed jobs only';
end $$;

-- E
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002127302';
begin
  if not public.show_person_has_live_entry(v_show, '00000000-0000-0000-0000-000002127321')
     or not public.show_person_has_live_entry(v_show, '00000000-0000-0000-0000-000002127328') then
    raise exception 'FAIL E the send-time check missed Ada or the pending-payment exhibitor';
  end if;
  if public.show_person_has_live_entry(v_show, '00000000-0000-0000-0000-000002127326')
     or public.show_person_has_live_entry(v_show, '00000000-0000-0000-0000-000002127327') then
    raise exception 'FAIL E a withdrawn or pulled exhibitor was found';
  end if;
  update public.entries set entry_status = 'withdrawn'
   where id in ('00000000-0000-0000-0000-000002127341', '00000000-0000-0000-0000-000002127342');
  if public.show_person_has_live_entry(v_show, '00000000-0000-0000-0000-000002127321') then
    raise exception 'FAIL E an exhibitor who then withdrew every entry still counts';
  end if;
  raise notice 'PASS E the send-time check follows the entries, pending-payment included';
end $$;

-- F
do $$
begin
  begin
    insert into public.show_lifecycle_email_steps (show_id, step_type, is_enabled)
    values ('00000000-0000-0000-0000-000002127312', 'not_a_step', true);
    raise exception 'FAIL F the steps CHECK accepted an unknown step_type';
  exception when check_violation then null;
  end;
  if (select count(*) from public.show_lifecycle_email_steps
       where show_id = '00000000-0000-0000-0000-000002127302' and step_type = 'show_cancelled') <> 1 then
    raise exception 'FAIL F the show has no show_cancelled step';
  end if;
  if has_function_privilege('authenticated', 'public.queue_show_cancelled_email(uuid)', 'execute')
     or has_function_privilege('anon', 'public.queue_show_cancelled_email(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.queue_show_cancelled_email_from_show()', 'execute')
     then
    raise exception 'FAIL F an API role can run a producer function';
  end if;
  raise notice 'PASS F the step is allowed and the functions are not callable by an API role';
end $$;

rollback;
