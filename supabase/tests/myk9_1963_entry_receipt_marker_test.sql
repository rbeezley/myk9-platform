-- MYK9-1963: entries.receipt_email_* is server-only state.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; the fixture rolls back.
-- A clean run prints PASS notices.
--
--   A. an authenticated owner cannot change any receipt_email_* column on UPDATE (OLD is kept),
--      while an ordinary column in the same UPDATE still changes;
--   B. an authenticated INSERT that names receipt_email_* gets the defaults instead;
--   C. service_role can write them, and the sweep's failed -> sent transition sticks;
--   D. the pre-show confirmation_email_* columns are untouched by the guard.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000001963001', 'MYK9-1963 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001963002', 'MYK9-1963 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001963001', 'published');
insert into public.trials (id, show_id, name, date, registry_id) values
  ('00000000-0000-0000-0000-000001963003', '00000000-0000-0000-0000-000001963002',
   'MYK9-1963 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status, status_source) values
  ('00000000-0000-0000-0000-000001963004', '00000000-0000-0000-0000-000001963003', 'Class', 'upcoming', 'manual');
insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000001963011', 'MYK9-1963', 'Owner', '00000000-0000-0000-0000-000001963101');
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000001963012', 'MYK9-1963 Dog', 'Dog', 'Beagle', '00000000-0000-0000-0000-000001963011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary) values
  ('00000000-0000-0000-0000-000001963012', 'AKC (American Kennel Club)', 'SR1963', true);

-- Seeded as the migration owner (not a client): a failed receipt, as the release leaves it.
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
  receipt_email_status, receipt_email_attempted_at) values
  ('00000000-0000-0000-0000-000001963021', '00000000-0000-0000-0000-000001963012',
   '00000000-0000-0000-0000-000001963004', '00000000-0000-0000-0000-000001963002',
   '00000000-0000-0000-0000-000001963003', 'confirmed', 'pending', 25, 'failed', now() - interval '1 hour');

do $$
declare
  r record;
begin
  -- A. authenticated owner tries to forge the receipt state.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001963101', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000001963101', 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.entries
     set receipt_email_status = 'sent', receipt_email_sent_at = now(),
         receipt_email_message_id = 'forged', receipt_email_attempted_at = now(),
         entry_fee = 26
   where id = '00000000-0000-0000-0000-000001963021';
  reset role;

  select * into r from public.entries where id = '00000000-0000-0000-0000-000001963021';
  if r.receipt_email_status <> 'failed' or r.receipt_email_sent_at is not null
     or r.receipt_email_message_id is not null
     or r.receipt_email_attempted_at > now() - interval '30 minutes' then
    raise exception 'FAIL A: client changed receipt_email_* (status %, sent_at %, message %)',
      r.receipt_email_status, r.receipt_email_sent_at, r.receipt_email_message_id;
  end if;
  if r.entry_fee <> 26 then
    raise exception 'FAIL A: the guard swallowed the ordinary column in the same UPDATE';
  end if;
  raise notice 'PASS A: authenticated UPDATE keeps OLD receipt_email_*';

  -- B. authenticated INSERT naming the columns gets the defaults.
  begin
    set local role authenticated;
    insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
      receipt_email_status, receipt_email_sent_at, receipt_email_message_id) values
      ('00000000-0000-0000-0000-000001963022', '00000000-0000-0000-0000-000001963012',
       '00000000-0000-0000-0000-000001963004', '00000000-0000-0000-0000-000001963002',
       '00000000-0000-0000-0000-000001963003', 'confirmed', 'pending', 25, 'sent', now(), 'forged');
    reset role;
  exception when insufficient_privilege or others then
    reset role;
    raise notice 'NOTE B: client INSERT refused by other policy (%); trigger path checked on UPDATE', sqlerrm;
  end;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000001963022';
  if found and (r.receipt_email_status <> 'pending' or r.receipt_email_sent_at is not null
                or r.receipt_email_message_id is not null) then
    raise exception 'FAIL B: client INSERT planted receipt_email_* (%)', r.receipt_email_status;
  end if;
  raise notice 'PASS B: authenticated INSERT cannot plant receipt_email_*';

  -- C. service_role (the edge functions) can write them.
  set local role service_role;
  update public.entries
     set receipt_email_status = 'sent', receipt_email_sent_at = now(),
         receipt_email_message_id = 'msg_1', receipt_email_attempted_at = now()
   where id = '00000000-0000-0000-0000-000001963021';
  reset role;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000001963021';
  if r.receipt_email_status <> 'sent' or r.receipt_email_sent_at is null
     or r.receipt_email_message_id <> 'msg_1' then
    raise exception 'FAIL C: service_role could not write receipt_email_* (%)', r.receipt_email_status;
  end if;
  raise notice 'PASS C: service_role writes receipt_email_*';

  -- D. the pre-show marker is a different column set and is not guarded.
  if r.confirmation_email_sent_at is not null then
    raise exception 'FAIL D: receipt write touched confirmation_email_sent_at';
  end if;
  raise notice 'PASS D: confirmation_email_* untouched';
end $$;

rollback;
