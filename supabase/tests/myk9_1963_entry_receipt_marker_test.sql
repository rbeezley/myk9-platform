-- MYK9-1963: entries.receipt_email_* is server-only state.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; the fixture rolls back.
-- A clean run prints PASS notices.
--
--   A. an authenticated owner cannot change any receipt_email_* column on UPDATE (OLD is kept),
--      while an ordinary column in the same UPDATE still changes;
--   B. an authenticated INSERT that names receipt_email_* gets the defaults instead;
--   C. service_role can write them, and the sweep's failed -> sent transition sticks;
--   D. the pre-show confirmation_email_* columns are untouched by the guard;
--   E. the backfill: a stamp on an entry whose trial confirms AFTER today is the old receipt and
--      moves to receipt_email_* (confirmation_email_* reset to pending); a stamp on a trial with a
--      null or past confirmation_date is only copied (confirmation_email_* kept); running it again
--      changes nothing.

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

-- E. backfill fixtures, seeded as the migration owner: old-code stamps, no receipt stamp.
insert into public.trials (id, show_id, name, date, registry_id, confirmation_date) values
  ('00000000-0000-0000-0000-000001963031', '00000000-0000-0000-0000-000001963002', 'Future', current_date, 'AKC',
   (date_trunc('day', now() at time zone 'UTC') + interval '3 days') at time zone 'UTC'),
  ('00000000-0000-0000-0000-000001963032', '00000000-0000-0000-0000-000001963002', 'Past', current_date, 'AKC',
   (date_trunc('day', now() at time zone 'UTC') - interval '3 days') at time zone 'UTC'),
  ('00000000-0000-0000-0000-000001963033', '00000000-0000-0000-0000-000001963002', 'Unset', current_date, 'AKC', null);
insert into public.classes (id, trial_id, name, status, status_source) values
  ('00000000-0000-0000-0000-000001963051', '00000000-0000-0000-0000-000001963031', 'Future class', 'upcoming', 'manual'),
  ('00000000-0000-0000-0000-000001963052', '00000000-0000-0000-0000-000001963032', 'Past class', 'upcoming', 'manual'),
  ('00000000-0000-0000-0000-000001963053', '00000000-0000-0000-0000-000001963033', 'Unset class', 'upcoming', 'manual');
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
  confirmation_email_sent_at, confirmation_email_message_id, confirmation_email_status) values
  ('00000000-0000-0000-0000-000001963041', '00000000-0000-0000-0000-000001963012', '00000000-0000-0000-0000-000001963051',
   '00000000-0000-0000-0000-000001963002', '00000000-0000-0000-0000-000001963031', 'confirmed', 'paid', 25,
   '2026-11-01T00:00:00Z', 'msg_future', 'sent'),
  ('00000000-0000-0000-0000-000001963042', '00000000-0000-0000-0000-000001963012', '00000000-0000-0000-0000-000001963052',
   '00000000-0000-0000-0000-000001963002', '00000000-0000-0000-0000-000001963032', 'confirmed', 'paid', 25,
   '2026-11-01T00:00:00Z', 'msg_past', 'sent'),
  ('00000000-0000-0000-0000-000001963043', '00000000-0000-0000-0000-000001963012', '00000000-0000-0000-0000-000001963053',
   '00000000-0000-0000-0000-000001963002', '00000000-0000-0000-0000-000001963033', 'confirmed', 'paid', 25,
   '2026-11-01T00:00:00Z', 'msg_unset', 'sent');

do $$
declare
  f record; p record; u record; f2 record;
begin
  perform private.backfill_entry_receipt_markers();

  select * into f from public.entries where id = '00000000-0000-0000-0000-000001963041';
  if f.receipt_email_sent_at is distinct from '2026-11-01T00:00:00Z'::timestamptz
     or f.receipt_email_message_id <> 'msg_future' or f.receipt_email_status <> 'sent'
     or f.confirmation_email_sent_at is not null or f.confirmation_email_message_id is not null
     or f.confirmation_email_status <> 'pending' then
    raise exception 'FAIL E1: future-confirmation stamp not moved to the receipt (%)', to_jsonb(f);
  end if;

  select * into p from public.entries where id = '00000000-0000-0000-0000-000001963042';
  select * into u from public.entries where id = '00000000-0000-0000-0000-000001963043';
  if p.receipt_email_sent_at is null or p.receipt_email_message_id <> 'msg_past' or p.receipt_email_status <> 'sent'
     or p.confirmation_email_sent_at is null or p.confirmation_email_status <> 'sent'
     or u.receipt_email_sent_at is null or u.receipt_email_message_id <> 'msg_unset'
     or u.confirmation_email_sent_at is null or u.confirmation_email_status <> 'sent' then
    raise exception 'FAIL E2: past/unset stamp must be copied and kept (% / %)', to_jsonb(p), to_jsonb(u);
  end if;

  perform private.backfill_entry_receipt_markers();
  select * into f2 from public.entries where id = '00000000-0000-0000-0000-000001963041';
  if to_jsonb(f2) is distinct from to_jsonb(f) then
    raise exception 'FAIL E3: backfill is not idempotent';
  end if;
  raise notice 'PASS E: backfill moves future-date stamps, copies past/unset ones, and is idempotent';
end $$;

-- E4. A stamped entry whose trial confirms TODAY (UTC) is ambiguous, so the backfill refuses.
insert into public.trials (id, show_id, name, date, registry_id, confirmation_date) values
  ('00000000-0000-0000-0000-000001963034', '00000000-0000-0000-0000-000001963002', 'Today', current_date, 'AKC',
   (date_trunc('day', now() at time zone 'UTC') + interval '12 hours') at time zone 'UTC');
insert into public.classes (id, trial_id, name, status, status_source) values
  ('00000000-0000-0000-0000-000001963054', '00000000-0000-0000-0000-000001963034', 'Today class', 'upcoming', 'manual');
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
  confirmation_email_sent_at, confirmation_email_message_id, confirmation_email_status) values
  ('00000000-0000-0000-0000-000001963044', '00000000-0000-0000-0000-000001963012', '00000000-0000-0000-0000-000001963054',
   '00000000-0000-0000-0000-000001963002', '00000000-0000-0000-0000-000001963034', 'confirmed', 'paid', 25,
   '2026-11-01T00:00:00Z', 'msg_today', 'sent');

do $$
declare
  t record;
begin
  begin
    perform private.backfill_entry_receipt_markers();
    raise exception 'FAIL E4: the backfill ran although a stamped entry confirms today';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'MYK9-1963 backfill:%' then
      raise;
    end if;
  end;
  select * into t from public.entries where id = '00000000-0000-0000-0000-000001963044';
  if t.receipt_email_sent_at is not null or t.confirmation_email_sent_at is null then
    raise exception 'FAIL E4: the refused backfill changed the today entry (%)', to_jsonb(t);
  end if;
  raise notice 'PASS E4: the backfill refuses while a stamped entry confirms today';
end $$;

rollback;
