-- MYK9-228 phase 4: the packet gets made the evening before, by nobody.
--
-- Two pieces: a claim ledger so overlapping runs cannot both generate, and the
-- cron that enumerates tomorrow's trial days and asks for one packet each.
--
-- ONE trigger, not the two the issue's design section names. Entry close was
-- dropped deliberately: the acceptance criterion is "re-running a trigger does
-- not produce a second packet or a second email for the same trial day", and
-- with the key at (show, trial date) an entry-close packet would simply make
-- the show-eve run a no-op — leaving the paper that reaches the trial box the
-- OLDER of the two, missing exactly the movements and pulls the evening run
-- exists to capture. Two packets per day was the alternative, and that is the
-- "two near-identical stacks" confusion the packet's own recovery page warns
-- about. See docs/plan-trial-packet-automation.md.

create table if not exists public.trial_packet_generation_claims (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows (id) on delete cascade,
  -- The trial DAY this claim covers, matching the packet unit.
  trial_date date not null,
  -- Written before generation starts. Doubles as the CAS token: every later
  -- write is conditional on the claim still carrying the value this run wrote.
  claimed_at timestamptz not null default now(),
  -- Set only once a packet was actually stored AND delivered. A row with NULL
  -- here is a claim whose run may have died mid-generation; a later run in the
  -- same window reclaims it after the lease rather than reading the unique
  -- conflict as "already done" and leaving the trial with no paper at all.
  completed_at timestamptz,
  constraint trial_packet_generation_claims_unique_day unique (show_id, trial_date)
);

comment on table public.trial_packet_generation_claims is
  'MYK9-228: idempotency ledger for automated emergency packet generation. One row per (show, trial day); completed_at distinguishes a finished run from an abandoned claim.';
comment on column public.trial_packet_generation_claims.completed_at is
  'Null means in-flight or abandoned. Only a non-null value proves a packet was stored and emailed.';

-- The cron looks claims up by exactly this pair, and the unique constraint
-- above already indexes it — no second index needed.

alter table public.trial_packet_generation_claims enable row level security;
-- FORCE so the migrations-only rebuild owner is subject to the policy too.
alter table public.trial_packet_generation_claims force row level security;

-- REQUIRED, not tidy-up: this repo carries ALTER DEFAULT PRIVILEGES granting
-- anon full CRUD on every newly created public table.
revoke all on public.trial_packet_generation_claims from anon;
revoke all on public.trial_packet_generation_claims from authenticated;
-- The function INSERTs a claim, SELECTs it to judge a stale lease, UPDATEs it
-- on completion or reclaim, and DELETEs it when generation failed.
grant select, insert, update, delete on public.trial_packet_generation_claims to service_role;

create policy trial_packet_generation_claims_deny_all
  on public.trial_packet_generation_claims
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Repeatedly through the 21:00-23:59 UTC evening — late afternoon to evening
-- across US time zones, i.e. the night before the trial. The whole window sits
-- inside one UTC day so `current_date + 1` names the same trial date on every
-- run. Repeats are cheap (a completed day is skipped after one indexed read)
-- and they are what makes the lease meaningful: a run that dies mid-render at
-- 21:00 is retried at 21:30 rather than leaving the trial with no paper.
--
-- The chain still has to end somewhere. A crash during the 23:30 run misses
-- that trial's packet, because once the clock passes midnight UTC no run
-- targets this date again — which is precisely what phase 5's print reminder
-- is for, since it keys on paperwork_prints rather than on our own success.
--
-- Timezone precision is a known, deliberate gap, matching show-eve's: for a
-- show far east of UTC, 21:00 UTC "tomorrow" is already that morning. A packet
-- that lands hours early still does its job; one that lands on the wrong DATE
-- would not, and the single-UTC-day window is what prevents that.
select cron.unschedule(jobid) from cron.job where jobname = 'trial-packet-show-eve';

select cron.schedule(
  'trial-packet-show-eve',
  '0,30 21,22,23 * * *',
  $trial_packet_cron$
  do $packet$
  declare
    edge_function_base_url text;
    packet_secret text;
    target_date date := current_date + 1;
    rec record;
  begin
    select decrypted_secret into edge_function_base_url
    from vault.decrypted_secrets where name = 'edge_function_base_url';
    select decrypted_secret into packet_secret
    from vault.decrypted_secrets where name = 'packet_cron_secret';

    -- Fail loudly rather than posting unauthenticated requests all evening.
    if nullif(edge_function_base_url, '') is null
       or nullif(packet_secret, '') is null then
      raise exception 'Missing Vault secret: edge_function_base_url or packet_cron_secret';
    end if;

    -- One request per (show, day), not per trial: a Sunday running three
    -- trials is ONE packet holding three trial sections.
    for rec in
      select distinct t.show_id, t.date
      from public.trials t
      join public.shows s on s.id = t.show_id
      where t.date = target_date
        and t.deleted_at is null
        and s.deleted_at is null
        and coalesce(t.status, '') <> 'cancelled'
        and coalesce(s.status, '') <> 'cancelled'
    loop
      -- The function authenticates on PACKET_CRON_SECRET and builds its own
      -- service-role client from its environment, so no key travels here.
      perform net.http_post(
        url := edge_function_base_url || '/generate-trial-packet',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || packet_secret
        ),
        body := jsonb_build_object(
          'showId', rec.show_id,
          'trialDate', to_char(rec.date, 'YYYY-MM-DD')
        )
      );
    end loop;
  end
  $packet$;
  $trial_packet_cron$
);
