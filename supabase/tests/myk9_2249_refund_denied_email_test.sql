-- MYK9-2249 (B-lite): a denied refund needs a reason, and the owner and handler are emailed it.
-- Executes the INSTALLED functions, constraint and triggers from
-- 20261120223700_myk9_2249_refund_denied_email.sql (never a source-string contract).
--
--   A. a denial with a reason queues one held refund_denied job each for the OWNER and the HANDLER
--      (distinct people), and none for the secretary who denied or for a co-owner
--   B. an owner who is also the handler gets ONE job; a secretary who owns the dog gets none
--   C. a blank, whitespace-only or NULL reason is refused and changes nothing
--   D. a reason with a NULL decision, and a blank reason on a denial, are refused by the CHECK
--   E. a legacy denial (no reason) still validates, and the constraint is validated
--   F. reinstating a denied no-show clears the decision AND the reason
--   G. a denial on a COMPLETED show queues; a draft show queues nothing
--   H. denying twice sends no second email; the two-argument version is still installed
--   I. the producer is not callable by an API role; both step_type CHECKs accept refund_denied
--
-- Fixtures roll back.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002249001', 'MYK9-2249 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002249002', 'MYK9-2249 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002249001', 'published'),
  ('00000000-0000-0000-0000-000002249012', 'MYK9-2249 Completed Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002249001', 'completed'),
  ('00000000-0000-0000-0000-000002249022', 'MYK9-2249 Draft Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002249001', 'draft');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000002249003', '00000000-0000-0000-0000-000002249002', 'T1', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002249013', '00000000-0000-0000-0000-000002249012', 'T2', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000002249023', '00000000-0000-0000-0000-000002249022', 'T3', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000002249004', '00000000-0000-0000-0000-000002249003', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002249014', '00000000-0000-0000-0000-000002249013', 'Container Novice A', 'completed', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000002249024', '00000000-0000-0000-0000-000002249023', 'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');

-- Ada owns, Hank handles, Cory co-owns, Sue is the show's secretary. All different people.
insert into public.people (id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-000002249021', 'Ada', 'Owner', 'ada-2249@example.test'),
  ('00000000-0000-0000-0000-000002249026', 'Sue', 'Secretary', 'sue-2249@example.test'),
  ('00000000-0000-0000-0000-000002249027', 'Cory', 'CoOwner', 'cory-2249@example.test'),
  ('00000000-0000-0000-0000-000002249028', 'Hank', 'Handler', 'hank-2249@example.test');
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000002249101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ada-2249@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002249102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sue-2249@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);
update public.people set auth_user_id = '00000000-0000-0000-0000-000002249101'
 where id = '00000000-0000-0000-0000-000002249021';
update public.people set auth_user_id = '00000000-0000-0000-0000-000002249102'
 where id = '00000000-0000-0000-0000-000002249026';

insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000002249026', id, '00000000-0000-0000-0000-000002249001', true,
       '00000000-0000-0000-0000-000002249102'
  from public.roles where name = 'secretary';

insert into public.dogs (id, name, call_name, breed, owner_id, co_owner_id) values
  ('00000000-0000-0000-0000-000002249031', 'Ada Dog One', 'One', 'Beagle', '00000000-0000-0000-0000-000002249021', '00000000-0000-0000-0000-000002249027'),
  ('00000000-0000-0000-0000-000002249032', 'Ada Dog Two', 'Two', 'Beagle', '00000000-0000-0000-0000-000002249021', null),
  ('00000000-0000-0000-0000-000002249033', 'Ada Dog Three', 'Three', 'Beagle', '00000000-0000-0000-0000-000002249021', null),
  ('00000000-0000-0000-0000-000002249034', 'Ada Dog Four', 'Four', 'Beagle', '00000000-0000-0000-0000-000002249021', null),
  ('00000000-0000-0000-0000-000002249035', 'Ada Dog Five', 'Five', 'Beagle', '00000000-0000-0000-0000-000002249021', null),
  ('00000000-0000-0000-0000-000002249036', 'Sue Dog', 'Six', 'Beagle', '00000000-0000-0000-0000-000002249026', null);

alter table public.entries disable trigger trg_entries_require_dog_registration;
-- A paid online entry is created only by the payment service (20260611270000).
set role service_role;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order,
                            check_in_status, payment_method, payment_status, entry_fee, handler_id) values
  -- 41: owner Ada, handler Hank, co-owner Cory
  ('00000000-0000-0000-0000-000002249041', '00000000-0000-0000-0000-000002249031', '00000000-0000-0000-0000-000002249004', '00000000-0000-0000-0000-000002249002', '00000000-0000-0000-0000-000002249003', 'scratched', '1', 1, 'no-status', 'online', 'paid', 30, '00000000-0000-0000-0000-000002249028'),
  -- 42: owner Ada who also handles
  ('00000000-0000-0000-0000-000002249042', '00000000-0000-0000-0000-000002249032', '00000000-0000-0000-0000-000002249004', '00000000-0000-0000-0000-000002249002', '00000000-0000-0000-0000-000002249003', 'scratched', '2', 2, 'no-status', 'online', 'paid', 30, '00000000-0000-0000-0000-000002249021'),
  -- 43: for the refused reasons
  ('00000000-0000-0000-0000-000002249043', '00000000-0000-0000-0000-000002249033', '00000000-0000-0000-0000-000002249004', '00000000-0000-0000-0000-000002249002', '00000000-0000-0000-0000-000002249003', 'scratched', '3', 3, 'no-status', 'online', 'paid', 30, '00000000-0000-0000-0000-000002249028'),
  -- 44: a no-show
  ('00000000-0000-0000-0000-000002249044', '00000000-0000-0000-0000-000002249034', '00000000-0000-0000-0000-000002249004', '00000000-0000-0000-0000-000002249002', '00000000-0000-0000-0000-000002249003', 'absent', '4', 4, 'no-status', 'online', 'paid', 30, '00000000-0000-0000-0000-000002249028'),
  -- 45: completed show
  ('00000000-0000-0000-0000-000002249045', '00000000-0000-0000-0000-000002249035', '00000000-0000-0000-0000-000002249014', '00000000-0000-0000-0000-000002249012', '00000000-0000-0000-0000-000002249013', 'absent', '1', 1, 'no-status', 'online', 'paid', 30, '00000000-0000-0000-0000-000002249028'),
  -- 46: the secretary's own dog
  ('00000000-0000-0000-0000-000002249046', '00000000-0000-0000-0000-000002249036', '00000000-0000-0000-0000-000002249004', '00000000-0000-0000-0000-000002249002', '00000000-0000-0000-0000-000002249003', 'scratched', '6', 6, 'no-status', 'online', 'paid', 30, '00000000-0000-0000-0000-000002249028'),
  -- 47: draft show
  ('00000000-0000-0000-0000-000002249047', '00000000-0000-0000-0000-000002249032', '00000000-0000-0000-0000-000002249024', '00000000-0000-0000-0000-000002249022', '00000000-0000-0000-0000-000002249023', 'scratched', '7', 7, 'no-status', 'online', 'paid', 30, '00000000-0000-0000-0000-000002249028');
reset role;
alter table public.entries enable trigger trg_entries_require_dog_registration;

create or replace function pg_temp.act(p_auth text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth, true);
  perform set_config('request.jwt.claims',
    case when p_auth = '' then '' else json_build_object('sub', p_auth, 'role', 'authenticated')::text end, true);
end $$;

create or replace function pg_temp.denial_jobs(p_entry uuid, p_person uuid default null) returns integer
language sql as $$
  select count(*)::integer
    from public.show_lifecycle_email_jobs j, jsonb_array_elements(j.entry_changes) ev
   where j.step_type = 'refund_denied' and ev->>'entry_id' = p_entry::text
     and (p_person is null or j.recipient_person_id = p_person)
$$;

-- A
do $$
declare
  v_job record;
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002249102');
  perform public.set_entry_refund_decision('00000000-0000-0000-0000-000002249041', 'denied', '  Past the refund deadline.  ');
  if (select refund_decision_reason from public.entries where id = '00000000-0000-0000-0000-000002249041')
     is distinct from 'Past the refund deadline.' then
    raise exception 'FAIL A the reason was not stored trimmed';
  end if;
  if pg_temp.denial_jobs('00000000-0000-0000-0000-000002249041') <> 2
     or pg_temp.denial_jobs('00000000-0000-0000-0000-000002249041', '00000000-0000-0000-0000-000002249021') <> 1
     or pg_temp.denial_jobs('00000000-0000-0000-0000-000002249041', '00000000-0000-0000-0000-000002249028') <> 1 then
    raise exception 'FAIL A expected one job each for the owner and the handler, and no others';
  end if;
  if pg_temp.denial_jobs('00000000-0000-0000-0000-000002249041', '00000000-0000-0000-0000-000002249026') <> 0 then
    raise exception 'FAIL A the secretary who denied was queued';
  end if;
  if pg_temp.denial_jobs('00000000-0000-0000-0000-000002249041', '00000000-0000-0000-0000-000002249027') <> 0 then
    raise exception 'FAIL A a co-owner (neither owner nor handler) was queued';
  end if;
  select * into v_job from public.show_lifecycle_email_jobs
   where step_type = 'refund_denied' and recipient_person_id = '00000000-0000-0000-0000-000002249021';
  if v_job.status <> 'held' or not v_job.auto_send or v_job.recipient_email <> 'ada-2249@example.test'
     or v_job.entry_changes <> jsonb_build_array(jsonb_build_object(
          'kind', 'refund_denied', 'entry_id', '00000000-0000-0000-0000-000002249041',
          'decided_at', (select refund_decided_at from public.entries
                          where id = '00000000-0000-0000-0000-000002249041'))) then
    raise exception 'FAIL A the job is wrong: %', row_to_json(v_job);
  end if;
  raise notice 'PASS A a denial with a reason queues one held job each for the owner and the handler';
end $$;

-- B
do $$
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002249102');
  perform public.set_entry_refund_decision('00000000-0000-0000-0000-000002249042', 'denied', 'Late pull.');
  if pg_temp.denial_jobs('00000000-0000-0000-0000-000002249042') <> 1 then
    raise exception 'FAIL B an owner who is also the handler should get one job, got %',
      pg_temp.denial_jobs('00000000-0000-0000-0000-000002249042');
  end if;
  -- Sue owns this dog and denies it: she is never the recipient; the handler still is.
  perform public.set_entry_refund_decision('00000000-0000-0000-0000-000002249046', 'denied', 'Late pull.');
  if pg_temp.denial_jobs('00000000-0000-0000-0000-000002249046', '00000000-0000-0000-0000-000002249026') <> 0
     or pg_temp.denial_jobs('00000000-0000-0000-0000-000002249046', '00000000-0000-0000-0000-000002249028') <> 1 then
    raise exception 'FAIL B the denying secretary must never be a recipient';
  end if;
  raise notice 'PASS B one job for an owner-handler, and never one for the secretary who denies';
end $$;

-- C
do $$
declare
  v_reason text;
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002249102');
  foreach v_reason in array array['', '   ', E' \n\t '] loop
    begin
      perform public.set_entry_refund_decision('00000000-0000-0000-0000-000002249043', 'denied', v_reason);
      raise exception 'FAIL C a blank reason was accepted: [%]', v_reason;
    exception when sqlstate '22023' then
      null;
    end;
  end loop;
  begin
    perform public.set_entry_refund_decision('00000000-0000-0000-0000-000002249043', 'denied', null);
    raise exception 'FAIL C a NULL reason was accepted';
  exception when sqlstate '22023' then
    null;
  end;
  if exists (select 1 from public.entries where id = '00000000-0000-0000-0000-000002249043'
              and (refund_decision is not null or refund_decision_reason is not null))
     or pg_temp.denial_jobs('00000000-0000-0000-0000-000002249043') <> 0 then
    raise exception 'FAIL C a refused denial changed the entry or queued mail';
  end if;
  raise notice 'PASS C a blank, whitespace-only or NULL reason is refused and changes nothing';
end $$;

-- D
do $$
begin
  perform pg_temp.act('');
  begin
    update public.entries set refund_decision_reason = 'Late.'
     where id = '00000000-0000-0000-0000-000002249043';
    raise exception 'FAIL D a reason with a NULL decision was accepted';
  exception when check_violation then
    null;
  end;
  begin
    update public.entries set refund_decision = 'denied', refund_decision_reason = '   '
     where id = '00000000-0000-0000-0000-000002249043';
    raise exception 'FAIL D a blank reason on a denial was accepted';
  exception when check_violation then
    null;
  end;
  begin
    update public.entries set refund_decision = 'denied', refund_decision_reason = E' \n\t '
     where id = '00000000-0000-0000-0000-000002249043';
    raise exception 'FAIL D a newline-only reason on a denial was accepted';
  exception when check_violation then
    null;
  end;
  raise notice 'PASS D a reason with no decision, and a blank reason, are refused by the CHECK';
end $$;

-- E
do $$
begin
  perform pg_temp.act('');
  update public.entries set refund_decision = 'denied', refund_decided_at = now()
   where id = '00000000-0000-0000-0000-000002249043';
  if (select refund_decision_reason from public.entries where id = '00000000-0000-0000-0000-000002249043') is not null then
    raise exception 'FAIL E a legacy denial should keep a NULL reason';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'entries_refund_decision_reason_check' and convalidated) then
    raise exception 'FAIL E the reason CHECK is not validated';
  end if;
  update public.entries set refund_decision = null, refund_decided_at = null
   where id = '00000000-0000-0000-0000-000002249043';
  raise notice 'PASS E a legacy denial with no reason validates';
end $$;

-- F
do $$
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002249102');
  perform public.set_entry_refund_decision('00000000-0000-0000-0000-000002249044', 'denied', 'No-show, no refund.');
  perform pg_temp.act('');
  update public.entries set entry_status = 'confirmed' where id = '00000000-0000-0000-0000-000002249044';
  if exists (select 1 from public.entries where id = '00000000-0000-0000-0000-000002249044'
              and (refund_decision is not null or refund_decision_reason is not null
                   or refund_decided_at is not null or refund_decided_by is not null)) then
    raise exception 'FAIL F reinstating a denied no-show left the decision or the reason';
  end if;
  raise notice 'PASS F reinstating a denied no-show clears the decision and the reason';
end $$;

-- G
do $$
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002249102');
  perform public.set_entry_refund_decision('00000000-0000-0000-0000-000002249045', 'denied', 'Show is over.');
  if pg_temp.denial_jobs('00000000-0000-0000-0000-000002249045', '00000000-0000-0000-0000-000002249021') <> 1
     or pg_temp.denial_jobs('00000000-0000-0000-0000-000002249045', '00000000-0000-0000-0000-000002249028') <> 1 then
    raise exception 'FAIL G a completed show should queue one job each for its owner and its handler';
  end if;
  perform public.set_entry_refund_decision('00000000-0000-0000-0000-000002249047', 'denied', 'Draft.');
  if pg_temp.denial_jobs('00000000-0000-0000-0000-000002249047') <> 0 then
    raise exception 'FAIL G a draft show queued a job';
  end if;
  raise notice 'PASS G a completed show queues; a draft show queues nothing';
end $$;

-- H
do $$
declare
  v_before integer;
begin
  perform pg_temp.act('00000000-0000-0000-0000-000002249102');
  select count(*) into v_before from public.show_lifecycle_email_jobs where step_type = 'refund_denied';
  perform public.set_entry_refund_decision('00000000-0000-0000-0000-000002249041', 'denied', 'A different reason.');
  if (select count(*) from public.show_lifecycle_email_jobs where step_type = 'refund_denied') <> v_before then
    raise exception 'FAIL H denying twice queued a second email';
  end if;
  if (select refund_decision_reason from public.entries where id = '00000000-0000-0000-0000-000002249041')
     <> 'Past the refund deadline.' then
    raise exception 'FAIL H the first reason was overwritten';
  end if;
  if to_regprocedure('public.set_entry_refund_decision(uuid, text)') is null then
    raise exception 'FAIL H the two-argument version must stay until the follow-up drop';
  end if;
  raise notice 'PASS H a second denial sends nothing, and the two-argument version is still installed';
end $$;

-- I
do $$
declare
  v_step text;
  v_show constant uuid := '00000000-0000-0000-0000-000002249022';
begin
  begin
    set local role authenticated;
    perform public.queue_refund_denied_email('00000000-0000-0000-0000-000002249041', null);
    raise exception 'FAIL I an API role called the producer';
  exception when insufficient_privilege then
    reset role;
  end;
  delete from public.show_lifecycle_email_steps where show_id = v_show;
  perform public.ensure_show_lifecycle_email_steps(v_show);
  if (select count(*) from public.show_lifecycle_email_steps where show_id = v_show) <> 12 then
    raise exception 'FAIL I ensure_show_lifecycle_email_steps should seed all twelve steps';
  end if;
  foreach v_step in array array['show_cancelled', 'pulled_out', 'refund_denied'] loop
    if not exists (select 1 from public.show_lifecycle_email_steps where show_id = v_show and step_type = v_step) then
      raise exception 'FAIL I the step % was not seeded', v_step;
    end if;
  end loop;
  begin
    insert into public.show_lifecycle_email_steps (show_id, step_type, is_enabled) values (v_show, 'not_a_step', true);
    raise exception 'FAIL I the steps CHECK accepted an unknown step type';
  exception when check_violation then
    null;
  end;
  raise notice 'PASS I the producer is not callable by an API role; the CHECKs list every step';
end $$;

rollback;
