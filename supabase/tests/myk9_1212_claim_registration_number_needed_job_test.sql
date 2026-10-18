-- MYK9-1212: claim_registration_number_needed_job and
-- finish_registration_number_needed_attempt, the atomic decision and the owner-only
-- outcome write behind the "registration number needed" email's exactly-once delivery.
--
-- A job is ACTIVE while claimed_until > now() (the lease alone); attempt_id only
-- decides who may record the outcome. The whole
-- file runs in one transaction, so now() is constant: a lease of now() + 10 minutes
-- stays active until a test expires it with pg_temp.expire().
--
--   A. first claim inserts one ready job on the handler's key, tied to the request,
--      with a fresh attempt and the lease
--   B. a replay of an own job is busy while its attempt is active (nothing written);
--      after expiry, or after a failed finish, it takes a NEW attempt on the same job
--   C. a retry after the job is sent answers sent, same id, no second row
--   D. an address change on an own job (not active) supersedes it, inserts a fresh
--      one with the new attempt, MOVES the tie, and never trips the unique indexes
--   E. a job superseded by ANOTHER request answers busy and keeps its key
--   F. another request's active attempt is busy, at any address, nothing written
--   G. a failed or abandoned job at the same address is RECOVERED and tied to the
--      request, with a new attempt
--   H. a failed or abandoned job at a different address is superseded; the new job
--      is tied on the plain request key
--   I. A creates a job, B recovers it, C recovers and sends it: all three keep
--      resolving to it; an address change re-points only one tie
--   J. entry and step must belong to the show; recipient, key and a future lease
--      are required
--   K. EXECUTE on both functions belongs to service_role alone; one claim overload
--      (the new 12-argument one); the tie table is service_role only
--   L. a soft-deleted entry is refused
--   O. attempt ownership (20261018023900): every send mints an attempt with the
--      lease; claims against an active job write nothing; finish with the owning
--      attempt records the outcome and clears both columns; a stale attempt's
--      finish answers false and leaves the row byte-identical; an expired lease is
--      recoverable or supersedable; finish cannot resurrect a skipped or sent job;
--      p_stale_before is ignored and the pre-redesign named call still resolves;
--      a job leased by the previous version (future claimed_until, NULL attempt_id)
--      is active: busy, nothing written (the lease alone decides "active")
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

-- The call under test, for the fixture show and entry, with an active lease by default.
create function pg_temp.claim(
  p_key text,
  p_email text,
  p_lease timestamptz default now() + interval '10 minutes'
) returns jsonb language sql as $$
  select public.claim_registration_number_needed_job(
    '00000000-0000-0000-0000-000001212002'::uuid,
    '00000000-0000-0000-0000-000001212006'::uuid,
    (select id from public.show_lifecycle_email_steps
      where show_id = '00000000-0000-0000-0000-000001212002' and step_type = 'registration_number_needed'),
    p_key, p_email, 'Claim Owner', 'Subject', 'Body', 'Note', null, p_lease)
$$;

-- Seeds one job for the fixture entry in an arbitrary state; p_active gives it a live attempt.
create function pg_temp.seed_job(
  p_idem text,
  p_request_key text,
  p_status text,
  p_email text,
  p_active boolean default false
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.show_lifecycle_email_jobs
    (show_id, step_id, step_type, recipient_scope, entry_id, recipient_email, status,
     idempotency_key, sent_at, skipped_at, attempt_id, claimed_until)
  select '00000000-0000-0000-0000-000001212002', s.id, 'registration_number_needed', 'entry',
         '00000000-0000-0000-0000-000001212006', p_email, p_status, p_idem,
         case when p_status = 'sent' then now() end,
         case when p_status = 'skipped' then now() end,
         case when p_active then gen_random_uuid() end,
         case when p_active then now() + interval '10 minutes' end
    from public.show_lifecycle_email_steps s
   where s.show_id = '00000000-0000-0000-0000-000001212002' and s.step_type = 'registration_number_needed'
  returning id into v_id;
  if p_request_key is not null then
    insert into public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
    values ('00000000-0000-0000-0000-000001212002', p_request_key, v_id);
  end if;
  return v_id;
end $$;

-- An attempt abandoned: its lease ran out (the attempt id stays, as a dead isolate leaves it).
create function pg_temp.expire(p_id uuid) returns void language sql as $$
  update public.show_lifecycle_email_jobs set claimed_until = now() - interval '1 second' where id = p_id
$$;

create function pg_temp.finish(p_id uuid, p_attempt uuid, p_status text) returns boolean language sql as $$
  select public.finish_registration_number_needed_attempt(
    p_id, p_attempt, p_status, null, 'R subject', 'R body', 'R note', null)
$$;

create function pg_temp.job(p_id uuid) returns public.show_lifecycle_email_jobs language sql as $$
  select * from public.show_lifecycle_email_jobs where id = p_id
$$;

-- The job a request key currently resolves to (NULL when it has no tie).
create function pg_temp.tie(p_key text) returns uuid language sql as $$
  select job_id from public.show_lifecycle_email_job_requests
   where show_id = '00000000-0000-0000-0000-000001212002' and request_key = p_key
$$;

create function pg_temp.tie_count(p_key text) returns int language sql as $$
  select count(*)::int from public.show_lifecycle_email_job_requests
   where show_id = '00000000-0000-0000-0000-000001212002' and request_key = p_key
$$;

create function pg_temp.job_count() returns int language sql as $$
  select count(*)::int from public.show_lifecycle_email_jobs
   where show_id = '00000000-0000-0000-0000-000001212002'
$$;

-- Everything the claim may write, as one comparable value.
create function pg_temp.snapshot() returns jsonb language sql as $$
  select jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.id) from public.show_lifecycle_email_jobs j
       where j.show_id = '00000000-0000-0000-0000-000001212002'), '[]'::jsonb),
    'ties', coalesce((select jsonb_agg(to_jsonb(r) order by r.request_key) from public.show_lifecycle_email_job_requests r
       where r.show_id = '00000000-0000-0000-0000-000001212002'), '[]'::jsonb))
$$;

create function pg_temp.reset() returns void language sql as $$
  delete from public.show_lifecycle_email_jobs where show_id = '00000000-0000-0000-0000-000001212002'
$$;

-- A. first claim
do $$
declare v jsonb; v_job public.show_lifecycle_email_jobs%rowtype;
begin
  perform pg_temp.reset();
  v := pg_temp.claim('myk9-1212-a', '  Jamie@Example.test ');
  if v->>'outcome' <> 'send' or (v->>'recovered')::boolean or v->>'attempt_id' is null then
    raise exception 'FAIL A first claim answered %', v;
  end if;
  v_job := pg_temp.job((v->>'job_id')::uuid);
  if v_job.status <> 'ready' or v_job.idempotency_key <> 'myk9-1212-a' or pg_temp.tie('myk9-1212-a') is distinct from v_job.id
     or v_job.recipient_email <> 'Jamie@Example.test' or v_job.recipient_scope <> 'entry'
     or v_job.step_type <> 'registration_number_needed'
     or v_job.entry_id <> '00000000-0000-0000-0000-000001212006'
     or v_job.subject <> 'Subject' or v_job.body <> 'Body' or v_job.secretary_note <> 'Note'
     or v_job.recipient_name <> 'Claim Owner' or v_job.due_at is null
     or v_job.attempt_id is distinct from (v->>'attempt_id')::uuid
     or v_job.claimed_until is distinct from now() + interval '10 minutes' then
    raise exception 'FAIL A inserted job is wrong: %', to_jsonb(v_job);
  end if;
  if pg_temp.job_count() <> 1 then raise exception 'FAIL A expected 1 job, found %', pg_temp.job_count(); end if;
  raise notice 'PASS A first claim inserts one ready job on the request key, tied, with an attempt and the lease';
end $$;

-- B. replay of an own job
do $$
declare v jsonb; v_id uuid; v_first uuid; v_before jsonb;
begin
  perform pg_temp.reset();
  v := pg_temp.claim('myk9-1212-b', 'a@example.test');
  v_id := (v->>'job_id')::uuid;
  v_first := (v->>'attempt_id')::uuid;
  -- Active: even the same request at the same address is busy, and nothing is written.
  v_before := pg_temp.snapshot();
  v := pg_temp.claim('myk9-1212-b', 'A@example.test ');
  if v->>'outcome' <> 'busy' or pg_temp.snapshot() is distinct from v_before then
    raise exception 'FAIL B a replay under an active attempt answered % or wrote', v;
  end if;
  -- Abandoned: the replay takes a NEW attempt on the same job.
  perform pg_temp.expire(v_id);
  v := pg_temp.claim('myk9-1212-b', 'a@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id or (v->>'recovered')::boolean
     or (v->>'attempt_id')::uuid = v_first
     or (pg_temp.job(v_id)).attempt_id is distinct from (v->>'attempt_id')::uuid
     or (pg_temp.job(v_id)).claimed_until is distinct from now() + interval '10 minutes' then
    raise exception 'FAIL B an abandoned replay answered % (job %)', v, v_id;
  end if;
  -- Finished failed by its owner: replayable at once.
  if not pg_temp.finish(v_id, (v->>'attempt_id')::uuid, 'failed') then
    raise exception 'FAIL B the owner could not finish failed';
  end if;
  v := pg_temp.claim('myk9-1212-b', 'a@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id then
    raise exception 'FAIL B a failed replay answered % (job %)', v, v_id;
  end if;
  if pg_temp.job_count() <> 1 then raise exception 'FAIL B a replay added a job'; end if;
  raise notice 'PASS B a replay is busy while active; abandoned or failed, it takes a new attempt on the same job';
end $$;

-- C. retry after sent
do $$
declare v jsonb; v_id uuid;
begin
  perform pg_temp.reset();
  v := pg_temp.claim('myk9-1212-c', 'a@example.test');
  v_id := (v->>'job_id')::uuid;
  perform pg_temp.finish(v_id, (v->>'attempt_id')::uuid, 'sent');
  v := pg_temp.claim('myk9-1212-c', 'a@example.test');
  if v->>'outcome' <> 'sent' or (v->>'job_id')::uuid <> v_id then
    raise exception 'FAIL C retry after sent answered % (job %)', v, v_id;
  end if;
  v := pg_temp.claim('myk9-1212-c', 'changed@example.test');
  if v->>'outcome' <> 'sent' or (v->>'job_id')::uuid <> v_id then
    raise exception 'FAIL C retry after sent with a changed address answered %', v;
  end if;
  if pg_temp.job_count() <> 1 then raise exception 'FAIL C a retry after sent added a job'; end if;
  raise notice 'PASS C a retry after sent answers sent with the same job and adds nothing';
end $$;

-- D. address change on an own job
do $$
declare v jsonb; v_old uuid; v_new uuid; v_third uuid; v_before jsonb; v_old_row public.show_lifecycle_email_jobs%rowtype;
  v_new_row public.show_lifecycle_email_jobs%rowtype;
begin
  perform pg_temp.reset();
  v_old := pg_temp.seed_job('myk9-1212-d', 'myk9-1212-d', 'failed', 'old@example.test');

  v := pg_temp.claim('myk9-1212-d', 'new@example.test');
  v_new := (v->>'job_id')::uuid;
  if v->>'outcome' <> 'send' or v_new = v_old or (v->>'recovered')::boolean then
    raise exception 'FAIL D address change answered % (old %)', v, v_old;
  end if;
  v_old_row := pg_temp.job(v_old);
  v_new_row := pg_temp.job(v_new);
  if v_old_row.status <> 'skipped' or v_old_row.skipped_at is null
     or v_old_row.attempt_id is not null or v_old_row.claimed_until is not null then
    raise exception 'FAIL D the old job was not superseded and released: %', to_jsonb(v_old_row);
  end if;
  if v_new_row.status <> 'ready' or v_new_row.recipient_email <> 'new@example.test'
     or pg_temp.tie('myk9-1212-d') is distinct from v_new
     or v_new_row.idempotency_key not like 'myk9-1212-d:to:%'
     or v_new_row.attempt_id is distinct from (v->>'attempt_id')::uuid then
    raise exception 'FAIL D the replacement is wrong: %', to_jsonb(v_new_row);
  end if;

  -- A lost response to that retry while it sends: busy, nothing written.
  v_before := pg_temp.snapshot();
  if pg_temp.claim('myk9-1212-d', 'new@example.test')->>'outcome' <> 'busy'
     or pg_temp.claim('myk9-1212-d', 'newest@example.test')->>'outcome' <> 'busy'
     or pg_temp.snapshot() is distinct from v_before then
    raise exception 'FAIL D a claim against the active replacement was not a write-free busy';
  end if;
  -- Abandoned: the same address replays the replacement; a further change replaces it.
  perform pg_temp.expire(v_new);
  v := pg_temp.claim('myk9-1212-d', 'new@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_new then
    raise exception 'FAIL D the retry of an abandoned replacement answered %', v;
  end if;
  perform pg_temp.expire(v_new);
  v_third := (pg_temp.claim('myk9-1212-d', 'newest@example.test')->>'job_id')::uuid;
  if v_third in (v_old, v_new) then raise exception 'FAIL D a second change reused a job'; end if;
  if pg_temp.tie_count('myk9-1212-d') <> 1 or pg_temp.tie('myk9-1212-d') is distinct from v_third
     or (select count(*) from public.show_lifecycle_email_jobs
          where show_id = '00000000-0000-0000-0000-000001212002' and status in ('ready', 'failed')) <> 1 then
    raise exception 'FAIL D after two changes the key or the outstanding count is wrong';
  end if;
  if (select count(distinct idempotency_key) from public.show_lifecycle_email_jobs
       where show_id = '00000000-0000-0000-0000-000001212002') <> 3 then
    raise exception 'FAIL D replacements share an idempotency_key';
  end if;
  raise notice 'PASS D an address change supersedes, moves the tie, never trips an index; never while active';
end $$;

-- E. superseded by another request
do $$
declare v jsonb; v_r1 uuid; v_r2 uuid;
begin
  perform pg_temp.reset();
  v := pg_temp.claim('myk9-1212-e1', 'old@example.test');
  v_r1 := (v->>'job_id')::uuid;
  perform pg_temp.finish(v_r1, (v->>'attempt_id')::uuid, 'failed');
  v := pg_temp.claim('myk9-1212-e2', 'new@example.test');
  v_r2 := (v->>'job_id')::uuid;
  if v->>'outcome' <> 'send' or v_r2 = v_r1 then raise exception 'FAIL E request 2 answered %', v; end if;
  if (pg_temp.job(v_r1)).status <> 'skipped' then
    raise exception 'FAIL E request 1''s job was not superseded';
  end if;
  v := pg_temp.claim('myk9-1212-e1', 'old@example.test');
  if v->>'outcome' <> 'busy' then raise exception 'FAIL E request 1 retry answered % instead of busy', v; end if;
  if pg_temp.tie('myk9-1212-e1') is distinct from v_r1 then
    raise exception 'FAIL E the superseded job lost its claim';
  end if;
  if pg_temp.job_count() <> 2 then raise exception 'FAIL E the busy retry added a job'; end if;
  raise notice 'PASS E a job replaced by another request answers busy and keeps its key';
end $$;

-- F. another request's active attempt
do $$
declare v jsonb; v_before jsonb;
begin
  perform pg_temp.reset();
  perform pg_temp.seed_job('myk9-1212-f0', 'myk9-1212-f0', 'ready', 'a@example.test', true);
  v_before := pg_temp.snapshot();
  v := pg_temp.claim('myk9-1212-f1', 'a@example.test');
  if v->>'outcome' <> 'busy' then raise exception 'FAIL F active same address answered %', v; end if;
  v := pg_temp.claim('myk9-1212-f1', 'other@example.test');
  if v->>'outcome' <> 'busy' then raise exception 'FAIL F active other address answered %', v; end if;
  if pg_temp.snapshot() is distinct from v_before then raise exception 'FAIL F a busy answer wrote'; end if;
  raise notice 'PASS F another request''s active attempt is busy at any address and untouched';
end $$;

-- G. recovery
do $$
declare v jsonb; v_id uuid; v_case text; v_status text; v_before jsonb;
begin
  for v_case, v_status in
    select * from (values ('g-failed', 'failed'), ('g-abandoned', 'ready')) as t(c, s)
  loop
    perform pg_temp.reset();
    v_id := pg_temp.seed_job('myk9-1212-' || v_case || '-orig', 'myk9-1212-' || v_case || '-orig',
                             v_status, 'a@example.test', v_status = 'ready');
    if v_status = 'ready' then perform pg_temp.expire(v_id); end if;
    v := pg_temp.claim('myk9-1212-' || v_case, 'a@example.test');
    if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id or not (v->>'recovered')::boolean
       or (pg_temp.job(v_id)).attempt_id is distinct from (v->>'attempt_id')::uuid
       or (pg_temp.job(v_id)).claimed_until <= now() then
      raise exception 'FAIL G % recovery answered % (job %)', v_case, v, v_id;
    end if;
    if pg_temp.tie('myk9-1212-' || v_case) is distinct from v_id
       or (pg_temp.job(v_id)).idempotency_key <> 'myk9-1212-' || v_case || '-orig' then
      raise exception 'FAIL G % recovery did not tie the request or changed the job''s own key', v_case;
    end if;
    -- The response was lost while the recovered send is in flight: busy, nothing written.
    v_before := pg_temp.snapshot();
    if pg_temp.claim('myk9-1212-' || v_case, 'a@example.test')->>'outcome' <> 'busy'
       or pg_temp.snapshot() is distinct from v_before then
      raise exception 'FAIL G % a retry during the recovered send was not a write-free busy', v_case;
    end if;
    -- The recovered job is then sent by its owner; a further retry answers sent.
    perform pg_temp.finish(v_id, (v->>'attempt_id')::uuid, 'sent');
    v := pg_temp.claim('myk9-1212-' || v_case, 'a@example.test');
    if v->>'outcome' <> 'sent' or (v->>'job_id')::uuid <> v_id then
      raise exception 'FAIL G % retry after the recovered job was sent answered %', v_case, v;
    end if;
    if pg_temp.job_count() <> 1 then raise exception 'FAIL G % ended with % jobs', v_case, pg_temp.job_count(); end if;
  end loop;
  raise notice 'PASS G a recovered failed/abandoned job is tied to the request and owned by a new attempt';
end $$;

-- H. different address, no tie
do $$
declare v jsonb; v_old uuid; v_new uuid; v_case text; v_status text;
begin
  for v_case, v_status in
    select * from (values ('h-failed', 'failed'), ('h-abandoned', 'ready')) as t(c, s)
  loop
    perform pg_temp.reset();
    v_old := pg_temp.seed_job('myk9-1212-' || v_case || '-orig', 'myk9-1212-' || v_case || '-orig',
                              v_status, 'old@example.test', v_status = 'ready');
    if v_status = 'ready' then perform pg_temp.expire(v_old); end if;
    v := pg_temp.claim('myk9-1212-' || v_case, 'new@example.test');
    v_new := (v->>'job_id')::uuid;
    if v->>'outcome' <> 'send' or v_new = v_old or (v->>'recovered')::boolean then
      raise exception 'FAIL H % answered %', v_case, v;
    end if;
    if (pg_temp.job(v_old)).status <> 'skipped' or (pg_temp.job(v_old)).skipped_at is null
       or (pg_temp.job(v_old)).attempt_id is not null then
      raise exception 'FAIL H % did not supersede and release the old job', v_case;
    end if;
    if pg_temp.tie('myk9-1212-' || v_case || '-orig') is distinct from v_old then
      raise exception 'FAIL H % released the old request''s claim', v_case;
    end if;
    if (pg_temp.job(v_new)).idempotency_key <> 'myk9-1212-' || v_case
       or pg_temp.tie('myk9-1212-' || v_case) is distinct from v_new then
      raise exception 'FAIL H % new job is not on the plain request key', v_case;
    end if;
  end loop;
  raise notice 'PASS H a failed/abandoned job at another address is superseded by a job tied on the plain key';
end $$;

-- I. A creates a job, B recovers it, C recovers it and sends it: all three keep resolving
do $$
declare v jsonb; v_j uuid; v_new uuid; k text;
begin
  perform pg_temp.reset();
  v := pg_temp.claim('myk9-1212-i-a', 'a@example.test');
  v_j := (v->>'job_id')::uuid;
  perform pg_temp.finish(v_j, (v->>'attempt_id')::uuid, 'failed');
  v := pg_temp.claim('myk9-1212-i-b', 'a@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_j or not (v->>'recovered')::boolean then
    raise exception 'FAIL I B did not recover A''s job: %', v;
  end if;
  -- B's attempt dies; C recovers the job and sends it.
  perform pg_temp.expire(v_j);
  v := pg_temp.claim('myk9-1212-i-c', 'a@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_j or not (v->>'recovered')::boolean then
    raise exception 'FAIL I C did not recover the job: %', v;
  end if;
  if not pg_temp.finish(v_j, (v->>'attempt_id')::uuid, 'sent') then
    raise exception 'FAIL I C could not record its send';
  end if;
  if pg_temp.tie('myk9-1212-i-a') is distinct from v_j or pg_temp.tie('myk9-1212-i-b') is distinct from v_j
     or pg_temp.tie('myk9-1212-i-c') is distinct from v_j then
    raise exception 'FAIL I a recovery overwrote another request''s tie';
  end if;
  foreach k in array array['myk9-1212-i-a', 'myk9-1212-i-b', 'myk9-1212-i-c'] loop
    v := pg_temp.claim(k, 'a@example.test');
    if v->>'outcome' <> 'sent' or (v->>'job_id')::uuid <> v_j then
      raise exception 'FAIL I % after the shared job was sent answered %', k, v;
    end if;
  end loop;
  if pg_temp.job_count() <> 1 then raise exception 'FAIL I the retries added a job'; end if;

  -- The same job READY with no live attempt: the first request takes it, the others are busy.
  update public.show_lifecycle_email_jobs set status = 'ready', sent_at = null where id = v_j;
  if pg_temp.claim('myk9-1212-i-a', 'a@example.test')->>'job_id' <> v_j::text
     or pg_temp.claim('myk9-1212-i-b', 'a@example.test')->>'outcome' <> 'busy'
     or pg_temp.claim('myk9-1212-i-c', 'a@example.test')->>'outcome' <> 'busy' then
    raise exception 'FAIL I the shared ready job was not owned by exactly one attempt';
  end if;

  -- That attempt is abandoned and B's address changes: only B's tie moves.
  perform pg_temp.expire(v_j);
  v := pg_temp.claim('myk9-1212-i-b', 'new@example.test');
  v_new := (v->>'job_id')::uuid;
  if v->>'outcome' <> 'send' or v_new = v_j then
    raise exception 'FAIL I B''s address change answered %', v;
  end if;
  if (pg_temp.job(v_j)).status <> 'skipped'
     or pg_temp.tie('myk9-1212-i-b') is distinct from v_new
     or pg_temp.tie('myk9-1212-i-a') is distinct from v_j
     or pg_temp.tie('myk9-1212-i-c') is distinct from v_j then
    raise exception 'FAIL I the replacement did not re-point only B''s tie';
  end if;
  if pg_temp.claim('myk9-1212-i-a', 'a@example.test')->>'outcome' <> 'busy'
     or pg_temp.claim('myk9-1212-i-c', 'a@example.test')->>'outcome' <> 'busy' then
    raise exception 'FAIL I the other requests'' retries did not answer busy';
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
      'myk9-1212-j1', 'a@example.test', null, 's', null, null, null, now() + interval '10 minutes');
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL J an entry of another show was accepted'; end if;

  v_raised := false;
  begin
    perform public.claim_registration_number_needed_job(
      '00000000-0000-0000-0000-000001212002', '00000000-0000-0000-0000-000001212006', v_other_step,
      'myk9-1212-j2', 'a@example.test', null, 's', null, null, null, now() + interval '10 minutes');
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL J a step of another type was accepted'; end if;

  v_raised := false;
  begin
    perform public.claim_registration_number_needed_job(
      '00000000-0000-0000-0000-000001212012', '00000000-0000-0000-0000-000001212006', v_step,
      'myk9-1212-j3', 'a@example.test', null, 's', null, null, null, now() + interval '10 minutes');
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

  v_raised := false;
  begin
    perform pg_temp.claim('myk9-1212-j5', 'a@example.test', null);
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL J a claim with no lease was accepted'; end if;

  v_raised := false;
  begin
    perform pg_temp.claim('myk9-1212-j6', 'a@example.test', now());
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL J a claim with an already-expired lease was accepted'; end if;

  if exists (select 1 from public.show_lifecycle_email_jobs
              where show_id in ('00000000-0000-0000-0000-000001212002', '00000000-0000-0000-0000-000001212012')) then
    raise exception 'FAIL J a refused claim wrote a job';
  end if;
  raise notice 'PASS J the entry and step must belong to the show; recipient, key and a future lease are required';
end $$;

-- K. privileges, signatures and the request_key index
do $$
declare
  v_sig text;
  v_step uuid;
begin
  foreach v_sig in array array[
    'public.claim_registration_number_needed_job(uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz, timestamptz)',
    'public.finish_registration_number_needed_attempt(uuid, uuid, text, uuid, text, text, text, uuid)'
  ] loop
    if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
      raise exception 'FAIL K service_role cannot execute %', v_sig;
    end if;
    if has_function_privilege('anon', v_sig, 'EXECUTE')
       or has_function_privilege('authenticated', v_sig, 'EXECUTE') then
      raise exception 'FAIL K an API role can execute %', v_sig;
    end if;
    if exists (
      select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = v_sig::regprocedure and a.grantee = 0
    ) then
      raise exception 'FAIL K PUBLIC can execute %', v_sig;
    end if;
    if not (select prosecdef from pg_proc where oid = v_sig::regprocedure)
       or (select proconfig from pg_proc where oid = v_sig::regprocedure) is distinct from array['search_path=""'] then
      raise exception 'FAIL K % is not SECURITY DEFINER with search_path = ''''', v_sig;
    end if;
  end loop;

  -- One claim overload, with the redesigned argument names: the lease 11th and required,
  -- p_stale_before trailing and defaulted (ignored).
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'claim_registration_number_needed_job') <> 1 then
    raise exception 'FAIL K a stale overload of the claim is still callable';
  end if;
  if (select proargnames[11] || ',' || proargnames[12] || ',' || pronargdefaults
        from pg_proc where proname = 'claim_registration_number_needed_job'
         and pronamespace = 'public'::regnamespace) <> 'p_lease_until,p_stale_before,1' then
    raise exception 'FAIL K the claim''s trailing arguments are not (p_lease_until, p_stale_before DEFAULT)';
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
  if not has_table_privilege('service_role', 'public.show_lifecycle_email_job_requests', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'FAIL K service_role cannot use the tie table';
  end if;

  -- One request key resolves to one job per show.
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
  delete from public.show_lifecycle_email_jobs where idempotency_key = 'myk9-1212-k-1';
  if pg_temp.tie_count('myk9-1212-k-key') <> 0 then
    raise exception 'FAIL K a deleted job left its tie behind';
  end if;
  raise notice 'PASS K both functions are service_role only; one claim overload; the tie table is service_role only';
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
  if pg_temp.job_count() <> 0 then raise exception 'FAIL L a refused claim wrote a job'; end if;
  raise notice 'PASS L a soft-deleted entry is refused';
end $$;

-- O. attempt ownership
do $$
declare
  v jsonb; v_id uuid; v_attempt uuid; v_new jsonb; v_before jsonb; v_row jsonb; v_raised boolean;
  v_job public.show_lifecycle_email_jobs%rowtype;
begin
  -- O1. claims against an active job write nothing, whatever the request or address
  perform pg_temp.reset();
  v := pg_temp.claim('myk9-1212-o1', 'a@example.test');
  v_id := (v->>'job_id')::uuid;
  v_before := pg_temp.snapshot();
  if pg_temp.claim('myk9-1212-o1', 'a@example.test')->>'outcome' <> 'busy'
     or pg_temp.claim('myk9-1212-o1', 'changed@example.test')->>'outcome' <> 'busy'
     or pg_temp.claim('myk9-1212-o1-other', 'a@example.test')->>'outcome' <> 'busy'
     or pg_temp.claim('myk9-1212-o1-other', 'changed@example.test')->>'outcome' <> 'busy'
     or pg_temp.snapshot() is distinct from v_before then
    raise exception 'FAIL O1 a claim against an active job was not a write-free busy';
  end if;
  raise notice 'PASS O1 replay, replace, recovery and supersede against an active job are busy and write nothing';

  -- O2. finish with the owning attempt records the outcome and clears both columns
  if not pg_temp.finish(v_id, (v->>'attempt_id')::uuid, 'sent') then
    raise exception 'FAIL O2 the owning attempt''s finish answered false';
  end if;
  v_job := pg_temp.job(v_id);
  if v_job.status <> 'sent' or v_job.sent_at is null or v_job.attempt_id is not null
     or v_job.claimed_until is not null or v_job.rendered_subject <> 'R subject'
     or v_job.rendered_body <> 'R body' or v_job.rendered_secretary_note <> 'R note' then
    raise exception 'FAIL O2 the owner''s sent finish wrote %', to_jsonb(v_job);
  end if;
  perform pg_temp.reset();
  v := pg_temp.claim('myk9-1212-o2', 'a@example.test');
  v_id := (v->>'job_id')::uuid;
  if not pg_temp.finish(v_id, (v->>'attempt_id')::uuid, 'failed')
     or (pg_temp.job(v_id)).status <> 'failed' or (pg_temp.job(v_id)).sent_at is not null
     or (pg_temp.job(v_id)).attempt_id is not null or (pg_temp.job(v_id)).claimed_until is not null then
    raise exception 'FAIL O2 the owner''s failed finish wrote %', to_jsonb(pg_temp.job(v_id));
  end if;
  raise notice 'PASS O2 the owning attempt records sent or failed and clears attempt_id and claimed_until';

  -- O3. a stale attempt's finish answers false and the row is byte-identical
  v := pg_temp.claim('myk9-1212-o2', 'a@example.test');           -- a new attempt on the failed job
  v_attempt := (v->>'attempt_id')::uuid;
  perform pg_temp.expire(v_id);
  v_new := pg_temp.claim('myk9-1212-o2', 'a@example.test');       -- abandoned: another attempt takes it
  if (v_new->>'attempt_id')::uuid = v_attempt then raise exception 'FAIL O3 an attempt id was reused'; end if;
  v_row := to_jsonb(pg_temp.job(v_id));
  if pg_temp.finish(v_id, v_attempt, 'sent') or pg_temp.finish(v_id, gen_random_uuid(), 'failed') then
    raise exception 'FAIL O3 a stale or unknown attempt''s finish answered true';
  end if;
  if to_jsonb(pg_temp.job(v_id)) is distinct from v_row then
    raise exception 'FAIL O3 a losing finish changed the row: % vs %', v_row, to_jsonb(pg_temp.job(v_id));
  end if;
  if (pg_temp.job(v_id)).attempt_id is distinct from (v_new->>'attempt_id')::uuid
     or (pg_temp.job(v_id)).claimed_until <= now() then
    raise exception 'FAIL O3 a losing finish cleared the current owner''s lease';
  end if;
  raise notice 'PASS O3 a stale attempt''s finish answers false and leaves the row byte-identical';

  -- O4. an expired lease is recoverable (same address) and supersedable (changed address)
  perform pg_temp.reset();
  v_id := pg_temp.seed_job('myk9-1212-o4-orig', null, 'ready', 'a@example.test', true);
  v_before := pg_temp.snapshot();
  if pg_temp.claim('myk9-1212-o4', 'a@example.test')->>'outcome' <> 'busy'
     or pg_temp.snapshot() is distinct from v_before then
    raise exception 'FAIL O4 an active seeded attempt was recovered';
  end if;
  perform pg_temp.expire(v_id);
  v := pg_temp.claim('myk9-1212-o4', 'a@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id or not (v->>'recovered')::boolean then
    raise exception 'FAIL O4 an abandoned attempt was not recovered: %', v;
  end if;
  perform pg_temp.expire(v_id);
  v := pg_temp.claim('myk9-1212-o4-other', 'changed@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid = v_id or (pg_temp.job(v_id)).status <> 'skipped' then
    raise exception 'FAIL O4 an abandoned attempt at a changed address was not superseded: %', v;
  end if;
  raise notice 'PASS O4 an expired lease is recoverable at the same address and supersedable at a changed one';

  -- O5. finish cannot resurrect a skipped or a sent job, even holding its old attempt id
  v_attempt := (pg_temp.job(v_id)).attempt_id;       -- NULL: supersede released it
  if v_attempt is not null then raise exception 'FAIL O5 a superseded job kept its attempt'; end if;
  update public.show_lifecycle_email_jobs set attempt_id = gen_random_uuid() where id = v_id
  returning attempt_id into v_attempt;
  if pg_temp.finish(v_id, v_attempt, 'sent') or (pg_temp.job(v_id)).status <> 'skipped' then
    raise exception 'FAIL O5 a finish resurrected a skipped job';
  end if;
  v := pg_temp.claim('myk9-1212-o4-other', 'changed@example.test');  -- busy: the replacement is active
  v_id := pg_temp.tie('myk9-1212-o4-other');
  v_attempt := (pg_temp.job(v_id)).attempt_id;
  perform pg_temp.finish(v_id, v_attempt, 'sent');
  update public.show_lifecycle_email_jobs set attempt_id = v_attempt where id = v_id;
  v_row := to_jsonb(pg_temp.job(v_id));
  if pg_temp.finish(v_id, v_attempt, 'failed') or to_jsonb(pg_temp.job(v_id)) is distinct from v_row then
    raise exception 'FAIL O5 a finish rewrote a sent job';
  end if;
  raise notice 'PASS O5 a finish cannot resurrect a skipped or sent job';

  -- O6. finish accepts only sent or failed, with an attempt
  foreach v_row in array array['"skipped"'::jsonb, '"ready"'::jsonb, 'null'::jsonb] loop
    v_raised := false;
    begin
      perform pg_temp.finish(v_id, v_attempt, v_row #>> '{}');
    exception when invalid_parameter_value then v_raised := true;
    end;
    if not v_raised then raise exception 'FAIL O6 finish accepted status %', v_row; end if;
  end loop;
  v_raised := false;
  begin
    perform pg_temp.finish(v_id, null, 'sent');
  exception when invalid_parameter_value then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL O6 finish accepted a NULL attempt'; end if;
  raise notice 'PASS O6 finish accepts only sent or failed, with an attempt id';

  -- O7. p_stale_before is ignored, and the pre-redesign handler's named call resolves
  perform pg_temp.reset();
  v := public.claim_registration_number_needed_job(
    p_show_id => '00000000-0000-0000-0000-000001212002',
    p_entry_id => '00000000-0000-0000-0000-000001212006',
    p_step_id => (select id from public.show_lifecycle_email_steps
                   where show_id = '00000000-0000-0000-0000-000001212002' and step_type = 'registration_number_needed'),
    p_request_key => 'myk9-1212-o7', p_recipient_email => 'a@example.test',
    p_recipient_name => null, p_subject => 's', p_body => null, p_secretary_note => null,
    p_user_id => null,
    p_stale_before => now() + interval '1 day',
    p_lease_until => now() + interval '10 minutes');
  if v->>'outcome' <> 'send' or v->>'attempt_id' is null then
    raise exception 'FAIL O7 the named pre-redesign call answered %', v;
  end if;
  v_id := (v->>'job_id')::uuid;
  perform pg_temp.expire(v_id);
  v := public.claim_registration_number_needed_job(
    '00000000-0000-0000-0000-000001212002', '00000000-0000-0000-0000-000001212006',
    (select id from public.show_lifecycle_email_steps
      where show_id = '00000000-0000-0000-0000-000001212002' and step_type = 'registration_number_needed'),
    'myk9-1212-o7-other', 'changed@example.test', null, 's', null, null, null,
    now() + interval '10 minutes', now() - interval '1 day');
  if v->>'outcome' <> 'send' or (pg_temp.job(v_id)).status <> 'skipped' then
    raise exception 'FAIL O7 p_stale_before changed the decision: %', v;
  end if;
  raise notice 'PASS O7 p_stale_before is ignored; the pre-redesign named call still resolves';
  -- O8. a send leased by the previous function version (lease, no attempt_id) is active
  perform pg_temp.reset();
  v_id := pg_temp.seed_job('myk9-1212-o8-orig', 'myk9-1212-o8-orig', 'ready', 'a@example.test');
  update public.show_lifecycle_email_jobs
     set claimed_until = now() + interval '5 minutes', attempt_id = null where id = v_id;
  v_before := pg_temp.snapshot();
  if pg_temp.claim('myk9-1212-o8-orig', 'a@example.test')->>'outcome' <> 'busy'
     or pg_temp.claim('myk9-1212-o8-orig', 'changed@example.test')->>'outcome' <> 'busy'
     or pg_temp.claim('myk9-1212-o8-other', 'a@example.test')->>'outcome' <> 'busy'
     or pg_temp.claim('myk9-1212-o8-other', 'changed@example.test')->>'outcome' <> 'busy'
     or pg_temp.snapshot() is distinct from v_before then
    raise exception 'FAIL O8 a pre-migration lease without an attempt was replayed, recovered or superseded';
  end if;
  -- Once that lease expires it is an abandoned send like any other: recoverable.
  perform pg_temp.expire(v_id);
  v := pg_temp.claim('myk9-1212-o8-other', 'a@example.test');
  if v->>'outcome' <> 'send' or (v->>'job_id')::uuid <> v_id or not (v->>'recovered')::boolean
     or (pg_temp.job(v_id)).attempt_id is distinct from (v->>'attempt_id')::uuid then
    raise exception 'FAIL O8 an expired pre-migration lease was not recovered: %', v;
  end if;
  raise notice 'PASS O8 a pre-migration lease (no attempt_id) is busy and untouched until it expires';
end $$;

rollback;
