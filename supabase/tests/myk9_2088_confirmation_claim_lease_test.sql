-- MYK9-2088: entries.confirmation_claimed_until is the full confirmation's server-only lease.
--
-- Run with psql -X -v ON_ERROR_STOP=1 against a migrated database; the fixture rolls back.
-- A clean run prints PASS notices.
--
--   A. an authenticated secretary cannot write the lease on UPDATE (OLD is kept), while an
--      ordinary column in the same UPDATE still changes;
--   B. an authenticated INSERT that names the lease gets NULL;
--   C. the claim predicate (sent_at IS NULL AND (lease IS NULL OR lease < now)): the first claim
--      wins, a second overlapping claim gets nothing, an expired lease is claimable again, and a
--      stamped entry is never claimable;
--   D. the stamp fenced on the lease value marks the claimed entry, and does nothing once the
--      lease is gone;
--   E. any entry_status change voids the lease (a re-acceptance cannot be marked sent by the old
--      run), and a fenced stamp after it matches no row;
--   F. a historical confirmation_email_sent_at is untouched by the guard and by a lease write;
--   G. column ACLs: anon and authenticated cannot read the column, anon cannot write it.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000002088001', 'MYK9-2088 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000002088002', 'MYK9-2088 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000002088001', 'published');
insert into public.trials (id, show_id, name, date, registry_id) values
  ('00000000-0000-0000-0000-000002088003', '00000000-0000-0000-0000-000002088002',
   'MYK9-2088 Trial', current_date, 'AKC');
insert into public.classes (id, trial_id, name, status, status_source) values
  ('00000000-0000-0000-0000-000002088004', '00000000-0000-0000-0000-000002088003', 'Class', 'upcoming', 'manual'),
  ('00000000-0000-0000-0000-000002088005', '00000000-0000-0000-0000-000002088003', 'Class B', 'upcoming', 'manual'),
  ('00000000-0000-0000-0000-000002088006', '00000000-0000-0000-0000-000002088003', 'Class C', 'upcoming', 'manual');
insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000002088011', 'MYK9-2088', 'Owner', '00000000-0000-0000-0000-000002088101');

insert into public.roles (id, name, description, is_system)
values ('00000000-0000-0000-0000-000002088801', 'secretary', 'MYK9-2088 fixture', true)
on conflict (name) do nothing;
insert into public.people (id, first_name, last_name, auth_user_id) values
  ('00000000-0000-0000-0000-000002088013', 'MYK9-2088', 'Secretary', '00000000-0000-0000-0000-000002088102');
insert into public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
select '00000000-0000-0000-0000-000002088013', id, '00000000-0000-0000-0000-000002088001', true,
  '00000000-0000-0000-0000-000002088102'
from public.roles where name = 'secretary';
insert into public.dogs (id, name, call_name, breed, owner_id) values
  ('00000000-0000-0000-0000-000002088012', 'MYK9-2088 Dog', 'Dog', 'Beagle', '00000000-0000-0000-0000-000002088011');
insert into public.dog_registrations (dog_id, organization, registration_number, is_primary) values
  ('00000000-0000-0000-0000-000002088012', 'AKC (American Kennel Club)', 'SR2088', true);

-- 021: unclaimed, unsent. 023: a historical send (stamp and 'sent' from before the lease).
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
  confirmation_email_sent_at, confirmation_email_status, confirmation_email_message_id) values
  ('00000000-0000-0000-0000-000002088021', '00000000-0000-0000-0000-000002088012',
   '00000000-0000-0000-0000-000002088004', '00000000-0000-0000-0000-000002088002',
   '00000000-0000-0000-0000-000002088003', 'confirmed', 'pending', 25, null, 'pending', null),
  ('00000000-0000-0000-0000-000002088023', '00000000-0000-0000-0000-000002088012',
   '00000000-0000-0000-0000-000002088006', '00000000-0000-0000-0000-000002088002',
   '00000000-0000-0000-0000-000002088003', 'confirmed', 'pending', 25,
   '2026-11-01T00:00:00Z', 'sent', 'msg_historical');

do $$
declare
  r record;
  n bigint;
  lease timestamptz := now() + interval '15 minutes';
begin
  -- A. a client tries to plant a lease.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000002088102', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000002088102', 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.entries
     set confirmation_claimed_until = now() + interval '5 years', armband = '777'
   where id = '00000000-0000-0000-0000-000002088021';
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then
    raise exception 'FAIL A: the secretary UPDATE matched % rows; RLS did not admit the caller', n;
  end if;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000002088021';
  if r.confirmation_claimed_until is not null then
    raise exception 'FAIL A: client wrote confirmation_claimed_until (%)', r.confirmation_claimed_until;
  end if;
  if r.armband is distinct from '777' then
    raise exception 'FAIL A: the guard swallowed the ordinary column in the same UPDATE (armband %)', r.armband;
  end if;
  raise notice 'PASS A: authenticated UPDATE keeps OLD confirmation_claimed_until';

  -- B. a client INSERT naming the lease gets NULL.
  set local role authenticated;
  insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, entry_fee,
    confirmation_claimed_until) values
    ('00000000-0000-0000-0000-000002088022', '00000000-0000-0000-0000-000002088012',
     '00000000-0000-0000-0000-000002088005', '00000000-0000-0000-0000-000002088002',
     '00000000-0000-0000-0000-000002088003', 'confirmed', 'pending', 25, now() + interval '5 years');
  reset role;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000002088022';
  if not found then
    raise exception 'FAIL B: the secretary INSERT did not create the row';
  end if;
  if r.confirmation_claimed_until is not null then
    raise exception 'FAIL B: client INSERT planted a lease (%)', r.confirmation_claimed_until;
  end if;
  raise notice 'PASS B: authenticated INSERT cannot plant a lease';

  -- C. the claim predicate, as service_role (the edge function).
  set local role service_role;
  update public.entries set confirmation_claimed_until = lease
   where id = '00000000-0000-0000-0000-000002088021'
     and confirmation_email_sent_at is null
     and (confirmation_claimed_until is null or confirmation_claimed_until < now());
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL C: the first claim matched % rows', n;
  end if;
  update public.entries set confirmation_claimed_until = now() + interval '15 minutes'
   where id = '00000000-0000-0000-0000-000002088021'
     and confirmation_email_sent_at is null
     and (confirmation_claimed_until is null or confirmation_claimed_until < now());
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL C: an overlapping claim matched % rows while the lease was live', n;
  end if;
  -- the lease runs out (a dead run): claimable again.
  update public.entries set confirmation_claimed_until = now() - interval '1 minute'
   where id = '00000000-0000-0000-0000-000002088021';
  update public.entries set confirmation_claimed_until = lease
   where id = '00000000-0000-0000-0000-000002088021'
     and confirmation_email_sent_at is null
     and (confirmation_claimed_until is null or confirmation_claimed_until < now());
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL C: an expired lease was not claimable (% rows)', n;
  end if;
  -- a stamped entry is never claimable, even with no lease.
  update public.entries set confirmation_claimed_until = lease
   where id = '00000000-0000-0000-0000-000002088023'
     and confirmation_email_sent_at is null
     and (confirmation_claimed_until is null or confirmation_claimed_until < now());
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL C: a stamped entry was claimable (% rows)', n;
  end if;
  reset role;
  raise notice 'PASS C: claim predicate is exclusive, recoverable after expiry, and skips sent entries';

  -- D. the fenced stamp after the provider accepts.
  set local role service_role;
  update public.entries
     set confirmation_email_sent_at = now(), confirmation_email_status = 'sent',
         confirmation_email_message_id = 'msg_1', confirmation_claimed_until = null
   where id = '00000000-0000-0000-0000-000002088021'
     and confirmation_claimed_until = lease and entry_status = 'confirmed';
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then
    raise exception 'FAIL D: the fenced stamp matched % rows', n;
  end if;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000002088021';
  if r.confirmation_email_sent_at is null or r.confirmation_claimed_until is not null
     or r.confirmation_email_status <> 'sent' then
    raise exception 'FAIL D: stamp did not stick (sent_at %, lease %)',
      r.confirmation_email_sent_at, r.confirmation_claimed_until;
  end if;
  raise notice 'PASS D: the fenced stamp marks the entry and clears the lease';

  -- E. a status change voids the lease; the old run's fenced stamp then marks nothing.
  update public.entries set confirmation_email_sent_at = null, confirmation_email_status = 'pending',
         confirmation_claimed_until = lease
   where id = '00000000-0000-0000-0000-000002088022';
  update public.entries set entry_status = 'paid' where id = '00000000-0000-0000-0000-000002088022';
  select * into r from public.entries where id = '00000000-0000-0000-0000-000002088022';
  if r.confirmation_claimed_until is not null then
    raise exception 'FAIL E: a status change left the lease (%)', r.confirmation_claimed_until;
  end if;
  update public.entries set entry_status = 'confirmed' where id = '00000000-0000-0000-0000-000002088022';
  set local role service_role;
  update public.entries
     set confirmation_email_sent_at = now(), confirmation_email_status = 'sent', confirmation_claimed_until = null
   where id = '00000000-0000-0000-0000-000002088022'
     and confirmation_claimed_until = lease and entry_status = 'confirmed';
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then
    raise exception 'FAIL E: the old run stamped a re-accepted entry (% rows)', n;
  end if;
  raise notice 'PASS E: a status change voids the lease; the old run cannot mark the new acceptance';

  -- F. the historical send is untouched, also through a lease write.
  set local role service_role;
  update public.entries set confirmation_claimed_until = null
   where id = '00000000-0000-0000-0000-000002088023';
  reset role;
  select * into r from public.entries where id = '00000000-0000-0000-0000-000002088023';
  if r.confirmation_email_sent_at is distinct from '2026-11-01T00:00:00Z'::timestamptz
     or r.confirmation_email_message_id <> 'msg_historical' or r.confirmation_email_status <> 'sent' then
    raise exception 'FAIL F: a historical marker changed (%, %)', r.confirmation_email_sent_at, r.confirmation_email_status;
  end if;
  raise notice 'PASS F: historical confirmation_email_* untouched';

  -- G. column ACLs.
  if has_column_privilege('anon', 'public.entries', 'confirmation_claimed_until', 'SELECT')
     or has_column_privilege('anon', 'public.entries', 'confirmation_claimed_until', 'UPDATE')
     or has_column_privilege('authenticated', 'public.entries', 'confirmation_claimed_until', 'SELECT') then
    raise exception 'FAIL G: a client role can read or write confirmation_claimed_until by grant';
  end if;
  if not has_column_privilege('service_role', 'public.entries', 'confirmation_claimed_until', 'UPDATE') then
    raise exception 'FAIL G: service_role cannot write confirmation_claimed_until';
  end if;
  raise notice 'PASS G: column ACLs';
end $$;

rollback;
