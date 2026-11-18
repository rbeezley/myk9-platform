-- MYK9-2126: a secretary's edit, move or pull of an entry on a published show queues one
-- automatic job per exhibitor.
--
--   A. a staff edit queues one ready, automatic job for the dog's owner, recording the old value
--   B. a second edit in the same sitting is the SAME job (one per person), its due time pushed
--      out and its events appended; the entry's new handler gets a job of his own
--   C. an exhibitor's own edit queues nothing; a change with no acting user queues nothing
--   D. an unpublished show queues nothing
--   E. a staff pull at the check-in desk queues a "pulled_at_show" event
--   F. a move (a successor entry, which is how an accepted class change request lands) queues
--      exactly one "moved" event, and the original's status flip to 'moved' adds none
--   G. the secretary's Undo of that move (original restored, successor removed) cancels the
--      move and records no removal
--   H. a change after the email went out queues a NEW job
--   I. the producer functions are not callable by an API role
--   J. a successor whose source is another show's (or another dog's) entry records no move
--   K. a move put back AFTER its email went out tells the move back to whoever was told
--   L. the handler NAME Edit Entry saves is tracked; an identity-link change alone is not
--   M. the exhibitor's own edit (here the dog's co-owner) drops a waiting staff edit of that
--      field and adds nothing
--   N. a co-owner's own pull queues nothing
--   O. each act is recorded in its own words: scratched = pulled, withdrawn with a reason =
--      withdrawn, withdrawn without one = removed (H)
--
-- Fixtures roll back. Every now() below is the transaction start, so due times compare exactly.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002126001', 'MYK9-2126 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002126002', 'MYK9-2126 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002126001', 'published'),
  ('00000000-0000-0000-0000-000002126012', 'MYK9-2126 Draft Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002126001', 'draft');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002126003', '00000000-0000-0000-0000-000002126002', 'MYK9-2126 Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002126013', '00000000-0000-0000-0000-000002126012', 'MYK9-2126 Draft Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002126004', '00000000-0000-0000-0000-000002126003', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002126005', '00000000-0000-0000-0000-000002126003', 'Interior Novice A', 'upcoming', 'Interior', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002126014', '00000000-0000-0000-0000-000002126013', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');

insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002126021', 'Ada', 'Owner', 'ada@example.test'),
  ('00000000-0000-0000-0000-000002126025', 'Hal', 'Handler', 'hal@example.test'),
  ('00000000-0000-0000-0000-000002126026', 'Sue', 'Secretary', 'sue@example.test'),
  ('00000000-0000-0000-0000-000002126027', 'Cora', 'Coowner', 'cora@example.test');
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000002126101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ada@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002126102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sue@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002126103', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cora@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);
update public.people set auth_user_id = '00000000-0000-0000-0000-000002126101'
 where id = '00000000-0000-0000-0000-000002126021';
update public.people set auth_user_id = '00000000-0000-0000-0000-000002126102'
 where id = '00000000-0000-0000-0000-000002126026';
update public.people set auth_user_id = '00000000-0000-0000-0000-000002126103'
 where id = '00000000-0000-0000-0000-000002126027';

insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002126031', 'Ada Dog One', 'One', 'Beagle', '00000000-0000-0000-0000-000002126021'),
  ('00000000-0000-0000-0000-000002126032', 'Ada Dog Two', 'Two', 'Beagle', '00000000-0000-0000-0000-000002126021');
insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id) values
  ('00000000-0000-0000-0000-000002126033', 'Ada Dog Three', 'Three', 'Beagle',
   '00000000-0000-0000-0000-000002126021', '00000000-0000-0000-0000-000002126027');

alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002126041', '00000000-0000-0000-0000-000002126031', '00000000-0000-0000-0000-000002126004', '00000000-0000-0000-0000-000002126002', '00000000-0000-0000-0000-000002126003', null, 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000002126042', '00000000-0000-0000-0000-000002126032', '00000000-0000-0000-0000-000002126004', '00000000-0000-0000-0000-000002126002', '00000000-0000-0000-0000-000002126003', '00000000-0000-0000-0000-000002126025', 'confirmed', '2', 2, 'no-status'),
  ('00000000-0000-0000-0000-000002126043', '00000000-0000-0000-0000-000002126031', '00000000-0000-0000-0000-000002126014', '00000000-0000-0000-0000-000002126012', '00000000-0000-0000-0000-000002126013', null, 'confirmed', '1', 1, 'no-status');
insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, handler, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000002126045', '00000000-0000-0000-0000-000002126033', '00000000-0000-0000-0000-000002126004', '00000000-0000-0000-0000-000002126002', '00000000-0000-0000-0000-000002126003', null, 'Hal Handlr', 'confirmed', '4', 3, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- Act as a signed-in user ('' = nobody: the service role, a cron job).
create or replace function pg_temp.act(p_auth text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth, true);
  perform set_config('request.jwt.claims',
    case when p_auth = '' then '' else json_build_object('sub', p_auth, 'role', 'authenticated')::text end, true);
end $$;

create or replace function pg_temp.jobs(p_show uuid, p_status text default null) returns integer
language sql as $$
  select count(*)::integer from public.show_lifecycle_email_jobs
   where show_id = p_show and step_type = 'entry_changed' and (p_status is null or status = p_status)
$$;

-- How many recorded events of a kind a person's ready job holds (any entry when p_entry is null).
create or replace function pg_temp.events(p_person uuid, p_kind text, p_entry uuid default null) returns integer
language sql as $$
  select count(*)::integer
    from public.show_lifecycle_email_jobs j,
         jsonb_array_elements(j.entry_changes) ev
   where j.step_type = 'entry_changed' and j.status = 'ready' and j.recipient_person_id = p_person
     and ev->>'kind' = p_kind and (p_entry is null or ev->>'entry_id' = p_entry::text)
$$;

-- A
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002126002';
  v_job record;
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  update public.entries set jump_height = '12' where id = '00000000-0000-0000-0000-000002126041';
  if pg_temp.jobs(v_show) <> 1 then
    raise exception 'FAIL A expected 1 job, found %', pg_temp.jobs(v_show);
  end if;
  select * into v_job from public.show_lifecycle_email_jobs where show_id = v_show and step_type = 'entry_changed';
  if v_job.recipient_person_id <> '00000000-0000-0000-0000-000002126021' or v_job.status <> 'ready'
     or not v_job.auto_send or v_job.recipient_scope <> 'show_recipient'
     or v_job.due_at <> now() + interval '5 minutes' or v_job.recipient_email <> 'ada@example.test' then
    raise exception 'FAIL A the job is wrong: %', row_to_json(v_job);
  end if;
  if v_job.entry_changes <> jsonb_build_array(jsonb_build_object(
       'kind', 'edited', 'entry_id', '00000000-0000-0000-0000-000002126041', 'field', 'jump_height', 'from', null)) then
    raise exception 'FAIL A the events are wrong: %', v_job.entry_changes;
  end if;
  raise notice 'PASS A a staff edit queues one automatic job for the owner';
end $$;

-- B
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002126002';
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  update public.show_lifecycle_email_jobs set due_at = now() - interval '1 minute'
   where show_id = v_show and step_type = 'entry_changed';
  -- A new handler: the name and the identity link together.
  update public.entries set handler_id = '00000000-0000-0000-0000-000002126025', handler = 'Hal Handler'
   where id = '00000000-0000-0000-0000-000002126041';
  if pg_temp.jobs(v_show, 'ready') <> 2 then
    raise exception 'FAIL B expected Ada once and Hal once, found %', pg_temp.jobs(v_show, 'ready');
  end if;
  if (select jsonb_array_length(entry_changes) from public.show_lifecycle_email_jobs
       where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002126021') <> 2 then
    raise exception 'FAIL B Ada''s one job should hold both edits';
  end if;
  if (select due_at from public.show_lifecycle_email_jobs
       where show_id = v_show and recipient_person_id = '00000000-0000-0000-0000-000002126021') <> now() + interval '5 minutes' then
    raise exception 'FAIL B the second edit should push the due time out';
  end if;
  raise notice 'PASS B several edits are one job per person and wait again';
end $$;

-- C
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002126002';
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126101');
  update public.entries set jump_height = '16' where id = '00000000-0000-0000-0000-000002126042';
  perform pg_temp.act('');
  update public.entries set jump_height = '20' where id = '00000000-0000-0000-0000-000002126042';
  if pg_temp.events('00000000-0000-0000-0000-000002126021', 'edited', '00000000-0000-0000-0000-000002126042') <> 0
     or pg_temp.events('00000000-0000-0000-0000-000002126025', 'edited', '00000000-0000-0000-0000-000002126042') <> 0 then
    raise exception 'FAIL C an exhibitor''s own edit, or one with no acting user, queued an event';
  end if;
  raise notice 'PASS C an exhibitor''s own change and a change with no actor send nothing';
end $$;

-- D
do $$
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  update public.entries set jump_height = '8' where id = '00000000-0000-0000-0000-000002126043';
  if pg_temp.jobs('00000000-0000-0000-0000-000002126012') <> 0 then
    raise exception 'FAIL D an unpublished show queued a job';
  end if;
  raise notice 'PASS D an unpublished show queues nothing';
end $$;

-- E
do $$
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  update public.entries set check_in_status = 'pulled' where id = '00000000-0000-0000-0000-000002126042';
  if pg_temp.events('00000000-0000-0000-0000-000002126021', 'pulled_at_show', '00000000-0000-0000-0000-000002126042') <> 1
     or pg_temp.events('00000000-0000-0000-0000-000002126025', 'pulled_at_show', '00000000-0000-0000-0000-000002126042') <> 1 then
    raise exception 'FAIL E a staff pull at the show should tell the owner and the handler';
  end if;
  if pg_temp.events('00000000-0000-0000-0000-000002126021', 'pulled', '00000000-0000-0000-0000-000002126042') <> 0 then
    raise exception 'FAIL E a day-of pull is not the pre-show pull';
  end if;
  raise notice 'PASS E a staff pull at the show is queued as one';
end $$;

-- F
-- The registration-number guard is not under test here (the fixture dogs have none).
alter table public.entries disable trigger trg_entries_require_dog_registration;
do $$
declare
  v_ada uuid := '00000000-0000-0000-0000-000002126021';
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  -- move_up_entry: a successor entry in the new class, then the original becomes 'moved'.
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status, moved_from_entry_id)
  values ('00000000-0000-0000-0000-000002126044', '00000000-0000-0000-0000-000002126031',
          '00000000-0000-0000-0000-000002126005', '00000000-0000-0000-0000-000002126002',
          '00000000-0000-0000-0000-000002126003', '00000000-0000-0000-0000-000002126025',
          'confirmed', '3', 1, 'no-status', '00000000-0000-0000-0000-000002126041');
  update public.entries set entry_status = 'moved' where id = '00000000-0000-0000-0000-000002126041';
  if pg_temp.events(v_ada, 'moved') <> 1 then
    raise exception 'FAIL F a move should queue exactly one moved event, found %', pg_temp.events(v_ada, 'moved');
  end if;
  if pg_temp.events(v_ada, 'withdrawn') <> 0 or pg_temp.events(v_ada, 'removed') <> 0 then
    raise exception 'FAIL F the original becoming moved must not read as a withdrawal';
  end if;
  if not exists (
       select 1 from public.show_lifecycle_email_jobs j, jsonb_array_elements(j.entry_changes) ev
        where j.recipient_person_id = v_ada and j.status = 'ready' and ev->>'kind' = 'moved'
          and ev->>'from_class_id' = '00000000-0000-0000-0000-000002126004'
          and ev->>'to_class_id' = '00000000-0000-0000-0000-000002126005'
          and ev->>'from_entry_id' = '00000000-0000-0000-0000-000002126041') then
    raise exception 'FAIL F the moved event names the wrong classes';
  end if;
  raise notice 'PASS F a move queues one moved event';
end $$;
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- G
do $$
declare
  v_ada uuid := '00000000-0000-0000-0000-000002126021';
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  -- reverse_move_up_entry: restore the original, then remove the successor.
  update public.entries set entry_status = 'confirmed' where id = '00000000-0000-0000-0000-000002126041';
  update public.entries set deleted_at = now() where id = '00000000-0000-0000-0000-000002126044';
  if pg_temp.events(v_ada, 'moved') <> 0 or pg_temp.events(v_ada, 'removed') <> 0 then
    raise exception 'FAIL G an Undone move should leave no moved and no removed event';
  end if;
  raise notice 'PASS G undoing a move cancels it';
end $$;

-- H
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002126002';
  v_before integer := pg_temp.jobs('00000000-0000-0000-0000-000002126002', 'sent');
begin
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = v_show and step_type = 'entry_changed';
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  -- No reason code: the secretary removed it (classifyEntryRemoval's 'removed').
  update public.entries set entry_status = 'withdrawn' where id = '00000000-0000-0000-0000-000002126041';
  if pg_temp.events('00000000-0000-0000-0000-000002126021', 'removed', '00000000-0000-0000-0000-000002126041') <> 1
     or pg_temp.events('00000000-0000-0000-0000-000002126021', 'withdrawn', '00000000-0000-0000-0000-000002126041') <> 0
     or pg_temp.jobs(v_show, 'ready') < 1 or pg_temp.jobs(v_show, 'sent') <= v_before then
    raise exception 'FAIL H a change after a send should be a new ready job beside the sent ones';
  end if;
  raise notice 'PASS H a change after a send queues a new job';
end $$;

-- I
do $$
begin
  if has_function_privilege('authenticated', 'public.queue_entry_changed_email(uuid, jsonb, uuid, uuid[])', 'execute')
     or has_function_privilege('service_role', 'public.queue_entry_changed_email(uuid, jsonb, uuid, uuid[])', 'execute')
     or has_function_privilege('authenticated', 'public.entry_change_actor(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.entry_change_actor(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.queue_entry_changed_email_from_insert()', 'execute')
     or has_function_privilege('authenticated', 'public.queue_entry_changed_email_from_update()', 'execute')
     or has_function_privilege('anon', 'public.queue_entry_changed_email(uuid, jsonb, uuid, uuid[])', 'execute') then
    raise exception 'FAIL I an API role can run a producer function';
  end if;
  raise notice 'PASS I the producer functions are not callable by an API role';
end $$;

-- J
alter table public.entries disable trigger trg_entries_require_dog_registration;
do $$
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  -- moved_from_entry_id names the DRAFT show's entry of another dog.
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status, moved_from_entry_id)
  values ('00000000-0000-0000-0000-000002126047', '00000000-0000-0000-0000-000002126033',
          '00000000-0000-0000-0000-000002126005', '00000000-0000-0000-0000-000002126002',
          '00000000-0000-0000-0000-000002126003', null,
          'withdrawn', '7', 7, 'no-status', '00000000-0000-0000-0000-000002126043');
  if pg_temp.events('00000000-0000-0000-0000-000002126021', 'moved', '00000000-0000-0000-0000-000002126047') <> 0 then
    raise exception 'FAIL J a successor of another show''s entry recorded a move';
  end if;
  raise notice 'PASS J a move is recorded only within the entry''s show and dog';
end $$;

-- K
do $$
declare
  v_show uuid := '00000000-0000-0000-0000-000002126002';
  v_ada uuid := '00000000-0000-0000-0000-000002126021';
begin
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = v_show and step_type = 'entry_changed' and status = 'ready';
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, armband, run_order, check_in_status, moved_from_entry_id)
  values ('00000000-0000-0000-0000-000002126048', '00000000-0000-0000-0000-000002126033',
          '00000000-0000-0000-0000-000002126005', v_show,
          '00000000-0000-0000-0000-000002126003', null,
          'confirmed', '8', 8, 'no-status', '00000000-0000-0000-0000-000002126045');
  update public.entries set entry_status = 'moved' where id = '00000000-0000-0000-0000-000002126045';
  if pg_temp.events(v_ada, 'moved', '00000000-0000-0000-0000-000002126048') <> 1 then
    raise exception 'FAIL K setup: the forward move was not queued';
  end if;
  -- The forward move's email goes out.
  update public.show_lifecycle_email_jobs
     set status = 'sent', sent_at = now(), attempt_id = null, claimed_until = null
   where show_id = v_show and step_type = 'entry_changed' and status = 'ready';
  -- Move back (reverse_move_up_entry): restore the original, remove the successor.
  update public.entries set entry_status = 'confirmed' where id = '00000000-0000-0000-0000-000002126045';
  update public.entries set deleted_at = now() where id = '00000000-0000-0000-0000-000002126048';
  if not exists (
       select 1 from public.show_lifecycle_email_jobs j, jsonb_array_elements(j.entry_changes) ev
        where j.recipient_person_id = v_ada and j.status = 'ready' and ev->>'kind' = 'moved'
          and ev->>'entry_id' = '00000000-0000-0000-0000-000002126045'
          and ev->>'from_entry_id' = '00000000-0000-0000-0000-000002126048'
          and ev->>'from_class_id' = '00000000-0000-0000-0000-000002126005'
          and ev->>'to_class_id' = '00000000-0000-0000-0000-000002126004') then
    raise exception 'FAIL K the move back was not told to the exhibitor already told of the move';
  end if;
  if pg_temp.events(v_ada, 'deleted') <> 0
     or pg_temp.events('00000000-0000-0000-0000-000002126025', 'moved') <> 0 then
    raise exception 'FAIL K the move back read as a deletion, or reached someone never told';
  end if;
  raise notice 'PASS K a move put back after its email tells the move back';
end $$;
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- L
do $$
declare
  v_ada uuid := '00000000-0000-0000-0000-000002126021';
  v_entry uuid := '00000000-0000-0000-0000-000002126045';
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  -- Edit Entry corrects the name and keeps the identity link (MYK9-665).
  update public.entries set handler = 'Hal Handler' where id = v_entry;
  if not exists (
       select 1 from public.show_lifecycle_email_jobs j, jsonb_array_elements(j.entry_changes) ev
        where j.recipient_person_id = v_ada and j.status = 'ready' and ev->>'kind' = 'edited'
          and ev->>'entry_id' = v_entry::text and ev->>'field' = 'handler'
          and ev->>'from' = 'Hal Handlr') then
    raise exception 'FAIL L a handler name correction was not recorded with the old name';
  end if;
  update public.entries set handler_id = '00000000-0000-0000-0000-000002126025' where id = v_entry;
  update public.entries set handler_id = null where id = v_entry;
  if (select count(*) from public.show_lifecycle_email_jobs j, jsonb_array_elements(j.entry_changes) ev
       where j.status = 'ready' and ev->>'entry_id' = v_entry::text and ev->>'field' = 'handler') <> 1 then
    raise exception 'FAIL L an identity-link change alone recorded a handler edit';
  end if;
  raise notice 'PASS L the handler name is tracked, the identity link alone is not';
end $$;

-- M
do $$
declare
  v_ada uuid := '00000000-0000-0000-0000-000002126021';
  v_entry uuid := '00000000-0000-0000-0000-000002126045';
  v_before integer;
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  update public.entries set jump_height = '12' where id = v_entry;
  if pg_temp.events(v_ada, 'edited', v_entry) <> 2 then
    raise exception 'FAIL M setup: expected the handler and the height edits, found %', pg_temp.events(v_ada, 'edited', v_entry);
  end if;
  v_before := (select count(*) from public.show_lifecycle_email_jobs where step_type = 'entry_changed');
  -- The co-owner corrects the height herself.
  perform pg_temp.act('00000000-0000-0000-0000-000002126103');
  update public.entries set jump_height = '16' where id = v_entry;
  if exists (
       select 1 from public.show_lifecycle_email_jobs j, jsonb_array_elements(j.entry_changes) ev
        where j.status = 'ready' and ev->>'entry_id' = v_entry::text and ev->>'field' = 'jump_height') then
    raise exception 'FAIL M the secretary''s superseded height edit is still waiting';
  end if;
  if pg_temp.events(v_ada, 'edited', v_entry) <> 1
     or (select count(*) from public.show_lifecycle_email_jobs where step_type = 'entry_changed') <> v_before then
    raise exception 'FAIL M the exhibitor''s edit touched another field or queued a job';
  end if;
  raise notice 'PASS M the exhibitor''s own edit has the last word on that field';
end $$;

-- N
do $$
declare
  v_entry uuid := '00000000-0000-0000-0000-000002126045';
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126103');
  update public.entries set entry_status = 'scratched' where id = v_entry;
  if exists (
       select 1 from public.show_lifecycle_email_jobs j, jsonb_array_elements(j.entry_changes) ev
        where j.status = 'ready' and ev->>'entry_id' = v_entry::text and ev->>'kind' = 'pulled') then
    raise exception 'FAIL N a co-owner''s own pull was queued';
  end if;
  raise notice 'PASS N a co-owner''s own pull sends nothing';
end $$;

-- O
do $$
declare
  v_ada uuid := '00000000-0000-0000-0000-000002126021';
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002126102');
  update public.entries set entry_status = 'scratched' where id = '00000000-0000-0000-0000-000002126042';
  update public.entries set entry_status = 'withdrawn', withdrawal_reason_code = 'in_season'
   where id = '00000000-0000-0000-0000-000002126045';
  if pg_temp.events(v_ada, 'pulled', '00000000-0000-0000-0000-000002126042') <> 1
     or pg_temp.events(v_ada, 'withdrawn', '00000000-0000-0000-0000-000002126042') <> 0 then
    raise exception 'FAIL O a secretary''s Pull (scratched) should be recorded as pulled';
  end if;
  if pg_temp.events(v_ada, 'withdrawn', '00000000-0000-0000-0000-000002126045') <> 1
     or pg_temp.events(v_ada, 'removed', '00000000-0000-0000-0000-000002126045') <> 0 then
    raise exception 'FAIL O a withdrawal with a reason should be recorded as withdrawn';
  end if;
  raise notice 'PASS O each act is recorded in its own words';
end $$;

rollback;
