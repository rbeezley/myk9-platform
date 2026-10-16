-- MYK9-1212: claim_registration_number_needed_job, the one atomic decision behind the
-- "registration number needed" email's exactly-once delivery.
--
--   A. first claim inserts one ready job on the handler's key, tied to the request
--   B. a retry of a ready/failed own job at the same address replays it (same id)
--   C. a retry after the job is sent answers sent, same id, no second row
--   D. FIX 2: a retry whose owner address changed supersedes the old job, inserts a
--      fresh one for the current address, MOVES the tie, and never trips the unique
--      indexes; the key points at exactly one job; a further change repeats it
--   E. a job superseded by ANOTHER request answers busy and keeps its key
--   F. another request's recent ready job is a send in flight: busy, nothing written
--   G. FIX 1: a failed or stale job at the same address is RECOVERED and tied to the
--      request, so the lost-response retry replays it and, once sent, answers sent
--   H. a failed or stale job at a different address is superseded; the new job is
--      tied on the plain request key
--   I. A creates a job, B recovers it, C recovers and sends it: all three keep
--      resolving to it (sent, replay); an address change re-points only one tie
--   J. entry and step must belong to the show; recipient and key are required
--   K. EXECUTE belongs to service_role alone; the tie table is service_role only
--      and a request key resolves to one job per show
--   L. a soft-deleted entry is refused
--   M. an address change on the request's own job: a recent ready send is busy and
--      untouched; a stale ready or failed job is replaced
--
-- Fixtures roll back.

begin;

insert into public.clubs (id, name) values ('00000000-0000-0000-0000-000001212001', 'MYK9-1212 Club');
insert into public.shows (id, name, organization, start_date, end_date, club_id, status) values
  ('00000000-0000-0000-0000-000001212002', 'MYK9-1212 Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001212001', 'draft'),
  ('00000000-0000-0000-0000-000001212012', 'MYK9-1212 Other Show', 'AKC', current_date, current_date,
   '00000000-0000-0000-0000-000001212001', 'draft');
insert into public.trials (id, show_id, name, date, registry_id, trial_type) values
  ('00000000-0000-0000-0000-000001212003', '00000000-0000-0000-0000-000001212002',
   'MYK9-1212 Trial', current_date, 'AKC', 'Scent Work'),
  ('00000000-0000-0000-0000-000001212013', '00000000-0000-0000-0000-000001212012',
   'MYK9-1212 Other Trial', current_date, 'AKC', 'Scent Work');
insert into public.classes (id, trial_id, name, status, element, level, section) values
  ('00000000-0000-0000-0000-000001212004', '00000000-0000-0000-0000-000001212003',
   'Container Novice A', 'upcoming', 'Container', 'Novice', 'A'),
  ('00000000-0000-0000-0000-000001212014', '00000000-0000-0000-0000-000001212013',
   'Container Novice A', 'upcoming', 'Container', 'Novice', 'A');
insert into public.dogs (id, name, call_name, breed) values
  ('00000000-0000-0000-0000-000001212005', 'MYK9-1212 Dog', 'Claim', 'Beagle');
alter table public.entries disable trigger trg_entries_require_dog_registration;
insert into public.entries (id, dog_id, class_id, show_id, trial_id, entry_status, armband, run_order, check_in_status) values
  ('00000000-0000-0000-0000-000001212006', '00000000-0000-0000-0000-000001212005',
   '00000000-0000-0000-0000-000001212004', '00000000-0000-0000-0000-000001212002',
   '00000000-0000-0000-0000-000001212003', 'confirmed', '1', 1, 'no-status'),
  ('00000000-0000-0000-0000-000001212016', '00000000-0000-0000-0000-000001212005',
   '00000000-0000-0000-0000-000001212014', '00000000-0000-0000-0000-000001212012',
   '00000000-0000-0000-0000-000001212013', 'confirmed', '2', 1, 'no-status');
alter table public.entries enable trigger trg_entries_require_dog_registration;

-- The call under test, for the fixture show and entry. The default stale cutoff is
-- ten minutes ago, the handler's NUMBER_NEEDED_STALE_SEND_MS.
create function pg_temp.claim(
  p_key text,
  p_email text,
  p_stale timestamptz default now() - interval '10 minutes'
) returns jsonb language sql as $$
  select public.claim_registration_number_needed_job(
    '00000000-0000-0000-0000-000001212002'::uuid,
    '00000000-0000-0000-0000-000001212006'::uuid,
    (select id from public.show_lifecycle_email_steps
      where show_id = '00000000-0000-0000-0000-000001212002' and step_type = 'registration_number_needed'),
    p_key, p_email, 'Claim Owner', 'Subject', 'Body', 'Note', null, p_stale)
$$;

-- Seeds one job for the fixture entry in an arbitrary state.
create function pg_temp.seed_job(
  p_idem text,
  p_request_key text,
  p_status text,
  p_email text,
  p_age interval default interval '0'
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.show_lifecycle_email_jobs
    (show_id, step_id, step_type, recipient_scope, entry_id, recipient_email, status,
     idempotency_key, created_at, sent_at, skipped_at)
  select '00000000-0000-0000-0000-000001212002', s.id, 'registration_number_needed', 'entry',
         '00000000-0000-0000-0000-000001212006', p_email, p_status, p_idem,
         now() - p_age,
         case when p_status = 'sent' then now() end,
         case when p_status = 'skipped' then now() end
    from public.show_lifecycle_email_steps s
   where s.show_id = '00000000-0000-0000-0000-000001212002' and s.step_type = 'registration_number_needed'
  returning id into v_id;
  if p_request_key is not null then
    insert into public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
    values ('00000000-0000-0000-0000-000001212002', p_request_key, v_id);
  end if;
  return v_id;
end $$;

-- The job a request key currently resolves to (NULL when it has no tie).
create function pg_temp.tie(p_key text) returns uuid language sql as $$
  select job_id from public.show_lifecycle_email_job_requests
   where show_id = '00000000-0000-0000-0000-000001212002' and request_key = p_key
$$;

-- Number of ties whose job is in this fixture show.
create function pg_temp.tie_count(p_key text) returns int language sql as $$
  select count(*)::int from public.show_lifecycle_email_job_requests
   where show_id = '00000000-0000-0000-0000-000001212002' and request_key = p_key
$$;

create function pg_temp.reset() returns void language sql as $$
  delete from public.show_lifecycle_email_jobs where show_id = '00000000-0000-0000-0000-000001212002'
$$;

-- A. first claim
do $$
declare v jsonb; v_job public.show_lifecycle_email_jobs%rowtype; v_rows int;
begin
  perform pg_temp.reset();
  v := pg_temp.claim('myk9-1212-a', '  Jamie@Example.test ');
  if v->>'outcome' <> 'send' or (v->>'recovered')::boolean then
    raise exception 'FAIL A first claim answered %', v;
  end if;
  select * into v_job from public.show_lifecycle_email_jobs where id = (v->>'job_id')::uuid;
  if v_job.status <> 'ready' or v_job.idempotency_key <> 'myk9-1212-a' or pg_temp.tie('myk9-1212-a') is distinct from v_job.id
     or v_job.recipient_email <> 'Jamie@Example.test' or v_job.recipient_scope <> 'entry'
     or v_job.step_type <> 'registration_number_needed'
     or v_job.entry_id <> '00000000-0000-0000-0000-000001212006'
     or v_job.subject <> 'Subject' or v_job.body <> 'Body' or v_job.secretary_note <> 'Note'
     or v_job.recipient_name <> 'Claim Owner' or v_job.due_at is null then
    raise exception 'FAIL A inserted job is wrong: %', to_jsonb(v_job);
  end if;
  select count(*) into v_rows from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000001212002';
  if v_rows <> 1 then raise exception 'FAIL A expected 1 job, found %', v_rows; end if;
  raise notice 'PASS A first claim inserts one ready job on the request key, tied to the request';
end $$;

-- B. replay of an own ready or failed job at the same address
do $$
declare v jsonb; v_id uuid; v_rows int;
begin
  perform pg_temp.reset();
  v_id := (pg_temp.claim('myk9-1212-b', 'a@example.test')->>'job_id')::uuid;
  v := pg_temp.claim('myk9-1212-b', 'A@example.test ');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id or (v->>'recovered')::boolean then
    raise exception 'FAIL B ready replay answered % (job %)', v, v_id;
  end if;
  update public.show_lifecycle_email_jobs set status = 'failed' where id = v_id;
  v := pg_temp.claim('myk9-1212-b', 'a@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id then
    raise exception 'FAIL B failed replay answered % (job %)', v, v_id;
  end if;
  select count(*) into v_rows from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000001212002';
  if v_rows <> 1 then raise exception 'FAIL B a replay added a job (% rows)', v_rows; end if;
  raise notice 'PASS B a retry of an own ready/failed job at the same address replays it';
end $$;

-- C. retry after sent
do $$
declare v jsonb; v_id uuid; v_rows int;
begin
  perform pg_temp.reset();
  v_id := (pg_temp.claim('myk9-1212-c', 'a@example.test')->>'job_id')::uuid;
  update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now() where id = v_id;
  v := pg_temp.claim('myk9-1212-c', 'a@example.test');
  if v->>'outcome' <> 'sent' or (v->>'job_id')::uuid <> v_id then
    raise exception 'FAIL C retry after sent answered % (job %)', v, v_id;
  end if;
  -- Even with a corrected address, a sent email is not sent again by its own retry.
  v := pg_temp.claim('myk9-1212-c', 'changed@example.test');
  if v->>'outcome' <> 'sent' or (v->>'job_id')::uuid <> v_id then
    raise exception 'FAIL C retry after sent with a changed address answered %', v;
  end if;
  select count(*) into v_rows from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000001212002';
  if v_rows <> 1 then raise exception 'FAIL C a retry after sent added a job (% rows)', v_rows; end if;
  raise notice 'PASS C a retry after sent answers sent with the same job and adds nothing';
end $$;

-- D. address change (fix 2)
do $$
declare
  v jsonb; v_old uuid; v_new uuid; v_third uuid; v_rows int; v_tied int; v_old_row public.show_lifecycle_email_jobs%rowtype;
  v_new_row public.show_lifecycle_email_jobs%rowtype;
begin
  perform pg_temp.reset();
  v_old := pg_temp.seed_job('myk9-1212-d', 'myk9-1212-d', 'failed', 'old@example.test');

  v := pg_temp.claim('myk9-1212-d', 'new@example.test');
  v_new := (v->>'job_id')::uuid;
  if v->>'outcome' <> 'send' or v_new = v_old or (v->>'recovered')::boolean then
    raise exception 'FAIL D address change answered % (old %)', v, v_old;
  end if;
  select * into v_old_row from public.show_lifecycle_email_jobs where id = v_old;
  select * into v_new_row from public.show_lifecycle_email_jobs where id = v_new;
  if v_old_row.status <> 'skipped' or v_old_row.skipped_at is null then
    raise exception 'FAIL D the old job was not superseded and released: %', to_jsonb(v_old_row);
  end if;
  if v_new_row.status <> 'ready' or v_new_row.recipient_email <> 'new@example.test'
     or pg_temp.tie('myk9-1212-d') is distinct from v_new
     or v_new_row.idempotency_key = 'myk9-1212-d'
     or v_new_row.idempotency_key not like 'myk9-1212-d:to:%' then
    raise exception 'FAIL D the replacement is wrong: %', to_jsonb(v_new_row);
  end if;

  -- A lost response to that retry: the same replacement, no third job.
  v := pg_temp.claim('myk9-1212-d', 'new@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_new then
    raise exception 'FAIL D the retry of a replacement answered %', v;
  end if;

  -- The address changes AGAIN before the replacement went out.
  -- (The replacement is a recent ready send: busy until it has gone stale.)
  if pg_temp.claim('myk9-1212-d', 'newest@example.test')->>'outcome' <> 'busy' then
    raise exception 'FAIL D a second change replaced a recent ready send';
  end if;
  update public.show_lifecycle_email_jobs set created_at = now() - interval '11 minutes' where id = v_new;
  v_third := (pg_temp.claim('myk9-1212-d', 'newest@example.test')->>'job_id')::uuid;
  if v_third in (v_old, v_new) then raise exception 'FAIL D a second change reused a job'; end if;

  v_tied := pg_temp.tie_count('myk9-1212-d');
  select count(*) into v_rows from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000001212002' and status in ('ready', 'failed');
  if v_tied <> 1 or v_rows <> 1 then
    raise exception 'FAIL D after two changes % jobs hold the key and % are outstanding', v_tied, v_rows;
  end if;
  if pg_temp.tie('myk9-1212-d') is distinct from v_third then
    raise exception 'FAIL D the key does not point at the newest job';
  end if;
  if (select count(distinct idempotency_key) from public.show_lifecycle_email_jobs
       where show_id = '00000000-0000-0000-0000-000001212002') <> 3 then
    raise exception 'FAIL D replacements share an idempotency_key';
  end if;
  raise notice 'PASS D an address change supersedes, moves the tie, never trips an index, and keeps one tied job';
end $$;

-- E. superseded by another request
do $$
declare v jsonb; v_r1 uuid; v_r2 uuid; v_rows int;
begin
  perform pg_temp.reset();
  v_r1 := (pg_temp.claim('myk9-1212-e1', 'old@example.test')->>'job_id')::uuid;
  update public.show_lifecycle_email_jobs set status = 'failed' where id = v_r1;
  -- Another request, for the corrected address: supersedes R1's job.
  v := pg_temp.claim('myk9-1212-e2', 'new@example.test');
  v_r2 := (v->>'job_id')::uuid;
  if v->>'outcome' <> 'send' or v_r2 = v_r1 then raise exception 'FAIL E request 2 answered %', v; end if;
  if (select status from public.show_lifecycle_email_jobs where id = v_r1) <> 'skipped' then
    raise exception 'FAIL E request 1''s job was not superseded';
  end if;
  v := pg_temp.claim('myk9-1212-e1', 'old@example.test');
  if v->>'outcome' <> 'busy' then raise exception 'FAIL E request 1 retry answered % instead of busy', v; end if;
  if pg_temp.tie('myk9-1212-e1') is distinct from v_r1 then
    raise exception 'FAIL E the superseded job lost its claim';
  end if;
  select count(*) into v_rows from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000001212002';
  if v_rows <> 2 then raise exception 'FAIL E the busy retry added a job (% rows)', v_rows; end if;
  raise notice 'PASS E a job replaced by another request answers busy and keeps its key';
end $$;

-- F. another request's recent ready job
do $$
declare v jsonb; v_id uuid; v_before jsonb; v_after jsonb;
begin
  perform pg_temp.reset();
  v_id := pg_temp.seed_job('myk9-1212-f0', 'myk9-1212-f0', 'ready', 'a@example.test', interval '2 minutes');
  select jsonb_agg(to_jsonb(j) order by j.id) into v_before from public.show_lifecycle_email_jobs j
   where show_id = '00000000-0000-0000-0000-000001212002';
  v := pg_temp.claim('myk9-1212-f1', 'a@example.test');
  if v->>'outcome' <> 'busy' then raise exception 'FAIL F in-flight same address answered %', v; end if;
  v := pg_temp.claim('myk9-1212-f1', 'other@example.test');
  if v->>'outcome' <> 'busy' then raise exception 'FAIL F in-flight other address answered %', v; end if;
  select jsonb_agg(to_jsonb(j) order by j.id) into v_after from public.show_lifecycle_email_jobs j
   where show_id = '00000000-0000-0000-0000-000001212002';
  if v_before is distinct from v_after then raise exception 'FAIL F a busy answer wrote: % vs %', v_before, v_after; end if;
  raise notice 'PASS F a recent ready job from another request is busy and untouched';
end $$;

-- G. recovery (fix 1)
do $$
declare
  v jsonb; v_id uuid; v_rows int; v_case text; v_status text; v_age interval;
begin
  for v_case, v_status, v_age in
    select * from (values
      ('g-failed', 'failed', interval '0'),
      ('g-stale', 'ready', interval '11 minutes')
    ) as t(c, s, a)
  loop
    perform pg_temp.reset();
    v_id := pg_temp.seed_job('myk9-1212-' || v_case || '-orig', 'myk9-1212-' || v_case || '-orig',
                             v_status, 'a@example.test', v_age);
    v := pg_temp.claim('myk9-1212-' || v_case, 'a@example.test');
    if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id or not (v->>'recovered')::boolean then
      raise exception 'FAIL G % recovery answered % (job %)', v_case, v, v_id;
    end if;
    if pg_temp.tie('myk9-1212-' || v_case) is distinct from v_id
       or (select idempotency_key from public.show_lifecycle_email_jobs where id = v_id) <> 'myk9-1212-' || v_case || '-orig' then
      raise exception 'FAIL G % recovery did not tie the request or changed the job''s own key', v_case;
    end if;
    -- The response was lost; the same request retries.
    v := pg_temp.claim('myk9-1212-' || v_case, 'a@example.test');
    if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id or (v->>'recovered')::boolean then
      raise exception 'FAIL G % retry of a recovery answered %', v_case, v;
    end if;
    -- The recovered job is then sent; a further retry must NOT insert a second email.
    update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now() where id = v_id;
    v := pg_temp.claim('myk9-1212-' || v_case, 'a@example.test');
    if v->>'outcome' <> 'sent' or (v->>'job_id')::uuid <> v_id then
      raise exception 'FAIL G % retry after the recovered job was sent answered %', v_case, v;
    end if;
    select count(*) into v_rows from public.show_lifecycle_email_jobs
     where show_id = '00000000-0000-0000-0000-000001212002';
    if v_rows <> 1 then raise exception 'FAIL G % ended with % jobs', v_case, v_rows; end if;
  end loop;
  raise notice 'PASS G a recovered failed/stale job is tied to the request that recovered it';
end $$;

-- H. different address, no tie
do $$
declare v jsonb; v_old uuid; v_new uuid; v_case text; v_status text; v_age interval;
begin
  for v_case, v_status, v_age in
    select * from (values
      ('h-failed', 'failed', interval '0'),
      ('h-stale', 'ready', interval '11 minutes')
    ) as t(c, s, a)
  loop
    perform pg_temp.reset();
    v_old := pg_temp.seed_job('myk9-1212-' || v_case || '-orig', 'myk9-1212-' || v_case || '-orig',
                              v_status, 'old@example.test', v_age);
    v := pg_temp.claim('myk9-1212-' || v_case, 'new@example.test');
    v_new := (v->>'job_id')::uuid;
    if v->>'outcome' <> 'send' or v_new = v_old or (v->>'recovered')::boolean then
      raise exception 'FAIL H % answered %', v_case, v;
    end if;
    if (select status from public.show_lifecycle_email_jobs where id = v_old) <> 'skipped'
       or (select skipped_at from public.show_lifecycle_email_jobs where id = v_old) is null then
      raise exception 'FAIL H % did not supersede the old job', v_case;
    end if;
    if pg_temp.tie('myk9-1212-' || v_case || '-orig') is distinct from v_old then
      raise exception 'FAIL H % released the old request''s claim', v_case;
    end if;
    if (select idempotency_key from public.show_lifecycle_email_jobs where id = v_new) <> 'myk9-1212-' || v_case
       or pg_temp.tie('myk9-1212-' || v_case) is distinct from v_new then
      raise exception 'FAIL H % new job is not on the plain request key', v_case;
    end if;
  end loop;
  raise notice 'PASS H a failed/stale job at another address is superseded by a job tied on the plain key';
end $$;

-- I. A creates a job, B recovers it, C recovers it and sends it: all three keep resolving
do $$
declare v jsonb; v_j uuid; v_rows int; v_new uuid;
begin
  perform pg_temp.reset();
  v_j := (pg_temp.claim('myk9-1212-i-a', 'a@example.test')->>'job_id')::uuid;
  update public.show_lifecycle_email_jobs set status = 'failed' where id = v_j;
  v := pg_temp.claim('myk9-1212-i-b', 'a@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_j or not (v->>'recovered')::boolean then
    raise exception 'FAIL I B did not recover A''s job: %', v;
  end if;
  v := pg_temp.claim('myk9-1212-i-c', 'a@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_j or not (v->>'recovered')::boolean then
    raise exception 'FAIL I C did not recover the job: %', v;
  end if;
  update public.show_lifecycle_email_jobs set status = 'sent', sent_at = now() where id = v_j;
  if pg_temp.tie('myk9-1212-i-a') is distinct from v_j or pg_temp.tie('myk9-1212-i-b') is distinct from v_j
     or pg_temp.tie('myk9-1212-i-c') is distinct from v_j then
    raise exception 'FAIL I a recovery overwrote another request''s tie';
  end if;
  -- Each request''s lost-response retry answers sent for the SAME job, adding nothing.
  for v in select pg_temp.claim(k, 'a@example.test') from unnest(array['myk9-1212-i-a', 'myk9-1212-i-b', 'myk9-1212-i-c']) k loop
    if v->>'outcome' <> 'sent' or (v->>'job_id')::uuid <> v_j then
      raise exception 'FAIL I a retry after the shared job was sent answered % (job %)', v, v_j;
    end if;
  end loop;
  select count(*) into v_rows from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000001212002';
  if v_rows <> 1 then raise exception 'FAIL I the retries added a job (% rows)', v_rows; end if;

  -- The same while the job is READY: every request replays it, never busy.
  update public.show_lifecycle_email_jobs set status = 'ready' where id = v_j;
  for v in select pg_temp.claim(k, 'a@example.test') from unnest(array['myk9-1212-i-a', 'myk9-1212-i-b', 'myk9-1212-i-c']) k loop
    if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_j or (v->>'recovered')::boolean then
      raise exception 'FAIL I a retry of the shared ready job answered %', v;
    end if;
  end loop;

  -- B's address changes: only B's tie moves; A and C find a skipped job (busy).
  update public.show_lifecycle_email_jobs set created_at = now() - interval '11 minutes' where id = v_j;
  v := pg_temp.claim('myk9-1212-i-b', 'new@example.test');
  v_new := (v->>'job_id')::uuid;
  if v->>'outcome' <> 'send' or v_new = v_j then
    raise exception 'FAIL I B''s address change answered %', v;
  end if;
  if (select status from public.show_lifecycle_email_jobs where id = v_j) <> 'skipped'
     or pg_temp.tie('myk9-1212-i-b') is distinct from v_new
     or pg_temp.tie('myk9-1212-i-a') is distinct from v_j
     or pg_temp.tie('myk9-1212-i-c') is distinct from v_j then
    raise exception 'FAIL I the replacement did not re-point only B''s tie';
  end if;
  if (pg_temp.claim('myk9-1212-i-a', 'a@example.test'))->>'outcome' <> 'busy'
     or (pg_temp.claim('myk9-1212-i-c', 'a@example.test'))->>'outcome' <> 'busy' then
    raise exception 'FAIL I the other requests'' retries did not answer busy';
  end if;
  if (pg_temp.claim('myk9-1212-i-b', 'new@example.test'))->>'job_id' <> v->>'job_id' then
    raise exception 'FAIL I B''s retry did not find its replacement';
  end if;
  raise notice 'PASS I many requests resolve to one job: A/B/C all find it; a change re-points only one tie';
end $$;

-- J. scope and required arguments
do $$
declare v_step uuid; v_other_step uuid; v_raised boolean;
begin
  perform pg_temp.reset();
  select id into v_step from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001212002' and step_type = 'registration_number_needed';
  select id into v_other_step from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001212002' and step_type = 'accepted';

  v_raised := false;
  begin
    perform public.claim_registration_number_needed_job(
      '00000000-0000-0000-0000-000001212002', '00000000-0000-0000-0000-000001212016', v_step,
      'myk9-1212-j1', 'a@example.test', null, 's', null, null, null, now());
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL J an entry of another show was accepted'; end if;

  v_raised := false;
  begin
    perform public.claim_registration_number_needed_job(
      '00000000-0000-0000-0000-000001212002', '00000000-0000-0000-0000-000001212006', v_other_step,
      'myk9-1212-j2', 'a@example.test', null, 's', null, null, null, now());
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL J a step of another type was accepted'; end if;

  v_raised := false;
  begin
    perform public.claim_registration_number_needed_job(
      '00000000-0000-0000-0000-000001212012', '00000000-0000-0000-0000-000001212006', v_step,
      'myk9-1212-j3', 'a@example.test', null, 's', null, null, null, now());
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL J a step of another show was accepted'; end if;

  v_raised := false;
  begin
    perform pg_temp.claim('myk9-1212-j4', '   ');
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL J a blank recipient was accepted'; end if;

  v_raised := false;
  begin
    perform pg_temp.claim('', 'a@example.test');
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL J a blank request key was accepted'; end if;

  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id in ('00000000-0000-0000-0000-000001212002', '00000000-0000-0000-0000-000001212012')) then
    raise exception 'FAIL J a refused claim wrote a job';
  end if;
  raise notice 'PASS J the entry and step must belong to the show; recipient and key are required';
end $$;

-- K. privileges and the request_key index
do $$
declare
  v_sig text := 'public.claim_registration_number_needed_job(uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz)';
  v_step uuid;
begin
  if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
    raise exception 'FAIL K service_role cannot execute the claim';
  end if;
  if has_function_privilege('anon', v_sig, 'EXECUTE')
     or has_function_privilege('authenticated', v_sig, 'EXECUTE') then
    raise exception 'FAIL K an API role can execute the claim';
  end if;
  if exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = v_sig::regprocedure and a.grantee = 0
  ) then
    raise exception 'FAIL K PUBLIC can execute the claim';
  end if;
  if not (select prosecdef from pg_proc where oid = v_sig::regprocedure)
     or (select proconfig from pg_proc where oid = v_sig::regprocedure) is distinct from array['search_path=""'] then
    raise exception 'FAIL K the claim is not SECURITY DEFINER with search_path = ''''';
  end if;

  -- The tie table: RLS enabled and forced, only a deny-all policy, no API-role privilege.
  if not (select relrowsecurity and relforcerowsecurity from pg_class
           where oid = 'public.show_lifecycle_email_job_requests'::regclass) then
    raise exception 'FAIL K the tie table does not have RLS enabled and forced';
  end if;
  if exists (select 1 from pg_policy
              where polrelid = 'public.show_lifecycle_email_job_requests'::regclass
                and (polqual is null or pg_get_expr(polqual, polrelid) <> 'false')) then
    raise exception 'FAIL K the tie table has a policy that is not deny-all';
  end if;
  if has_table_privilege('anon', 'public.show_lifecycle_email_job_requests', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('authenticated', 'public.show_lifecycle_email_job_requests', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'FAIL K an API role has a privilege on the tie table';
  end if;
  if exists (select 1 from information_schema.table_privileges
              where table_schema = 'public' and table_name = 'show_lifecycle_email_job_requests'
                and grantee in ('anon', 'authenticated', 'PUBLIC')) then
    raise exception 'FAIL K an API role is granted on the tie table';
  end if;
  if not has_table_privilege('service_role', 'public.show_lifecycle_email_job_requests', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'FAIL K service_role cannot use the tie table';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'show_lifecycle_email_jobs' and column_name = 'request_key') then
    raise exception 'FAIL K the jobs table still has a request_key column';
  end if;

  -- One request key resolves to one job per show; the same key may exist in another show.
  perform pg_temp.reset();
  select id into v_step from public.show_lifecycle_email_steps
   where show_id = '00000000-0000-0000-0000-000001212002' and step_type = 'registration_number_needed';
  insert into public.show_lifecycle_email_jobs (show_id, step_id, step_type, recipient_scope, idempotency_key)
  values ('00000000-0000-0000-0000-000001212002', v_step, 'accepted', 'entry', 'myk9-1212-k-1'),
         ('00000000-0000-0000-0000-000001212002', v_step, 'accepted', 'entry', 'myk9-1212-k-2');
  insert into public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
  select '00000000-0000-0000-0000-000001212002', 'myk9-1212-k-key', id
    from public.show_lifecycle_email_jobs where idempotency_key = 'myk9-1212-k-1';
  begin
    insert into public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
    select '00000000-0000-0000-0000-000001212002', 'myk9-1212-k-key', id
      from public.show_lifecycle_email_jobs where idempotency_key = 'myk9-1212-k-2';
    raise exception 'FAIL K one request key resolved to two jobs';
  exception when unique_violation then null;
  end;
  -- Deleting a job removes its ties.
  delete from public.show_lifecycle_email_jobs where idempotency_key = 'myk9-1212-k-1';
  if pg_temp.tie_count('myk9-1212-k-key') <> 0 then
    raise exception 'FAIL K a deleted job left its tie behind';
  end if;
  raise notice 'PASS K EXECUTE and the tie table are service_role only; a request key resolves to one job';
end $$;

-- L. a soft-deleted entry cannot be claimed (SECURITY DEFINER bypasses RLS)
do $$
declare v_raised boolean := false;
begin
  perform pg_temp.reset();
  update public.entries set deleted_at = now() where id = '00000000-0000-0000-0000-000001212006';
  begin
    perform pg_temp.claim('myk9-1212-l', 'a@example.test');
  exception when invalid_parameter_value then v_raised := true;
  end;
  update public.entries set deleted_at = null where id = '00000000-0000-0000-0000-000001212006';
  if not v_raised then raise exception 'FAIL L a soft-deleted entry was claimed'; end if;
  if exists (select 1 from public.show_lifecycle_email_jobs where show_id = '00000000-0000-0000-0000-000001212002') then
    raise exception 'FAIL L a refused claim wrote a job';
  end if;
  raise notice 'PASS L a soft-deleted entry is refused';
end $$;

-- M. an address change on the request's own job: recent ready is busy, stale ready replaces
do $$
declare v jsonb; v_id uuid; v_before jsonb; v_after jsonb; v_rows int;
begin
  perform pg_temp.reset();
  v_id := pg_temp.seed_job('myk9-1212-m', 'myk9-1212-m', 'ready', 'old@example.test', interval '2 minutes');
  select jsonb_agg(to_jsonb(j) order by j.id) into v_before from public.show_lifecycle_email_jobs j
   where show_id = '00000000-0000-0000-0000-000001212002';
  v := pg_temp.claim('myk9-1212-m', 'new@example.test');
  if v->>'outcome' <> 'busy' then
    raise exception 'FAIL M a recent ready job at a changed address answered %', v;
  end if;
  select jsonb_agg(to_jsonb(j) order by j.id) into v_after from public.show_lifecycle_email_jobs j
   where show_id = '00000000-0000-0000-0000-000001212002';
  if v_before is distinct from v_after or pg_temp.tie('myk9-1212-m') is distinct from v_id then
    raise exception 'FAIL M the busy answer wrote: % vs %', v_before, v_after;
  end if;

  -- Same address is still a replay.
  v := pg_temp.claim('myk9-1212-m', 'old@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id then
    raise exception 'FAIL M a recent ready job at the same address answered %', v;
  end if;

  -- A STALE ready job at a changed address is replaced.
  perform pg_temp.reset();
  v_id := pg_temp.seed_job('myk9-1212-m2', 'myk9-1212-m2', 'ready', 'old@example.test', interval '11 minutes');
  v := pg_temp.claim('myk9-1212-m2', 'new@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid = v_id
     or (select status from public.show_lifecycle_email_jobs where id = v_id) <> 'skipped'
     or pg_temp.tie('myk9-1212-m2') is distinct from (v->>'job_id')::uuid then
    raise exception 'FAIL M a stale ready job at a changed address answered %', v;
  end if;

  -- A FAILED job at a changed address is replaced.
  perform pg_temp.reset();
  v_id := pg_temp.seed_job('myk9-1212-m3', 'myk9-1212-m3', 'failed', 'old@example.test');
  v := pg_temp.claim('myk9-1212-m3', 'new@example.test');
  select count(*) into v_rows from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000001212002';
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid = v_id or v_rows <> 2 then
    raise exception 'FAIL M a failed job at a changed address answered %', v;
  end if;
  raise notice 'PASS M a recent ready job is busy at a changed address; stale ready and failed are replaced';
end $$;

rollback;
