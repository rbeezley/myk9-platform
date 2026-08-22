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
  -- A failed attempt RELEASES the day for retry, but deleting the row took the
  -- only evidence with it: the claim went, the uploaded object went, and for a
  -- render failure or an oversized packet no `trial_packet_snapshots` row is
  -- ever written either. A show could re-render and fail eight times in an
  -- evening and leave nothing behind but the body of a fire-and-forget
  -- `net.http_post`, which nobody reads. Phase 4's own acceptance criterion is
  -- that a failed generation be visible rather than silent, so instead of
  -- deleting we expire the lease in place and keep why.
  last_error text,
  failed_at timestamptz,
  attempts integer not null default 0,
  constraint trial_packet_generation_claims_unique_day unique (show_id, trial_date)
);

comment on table public.trial_packet_generation_claims is
  'MYK9-228: idempotency ledger for automated emergency packet generation. One row per (show, trial day); completed_at distinguishes a finished run from an abandoned claim.';
comment on column public.trial_packet_generation_claims.completed_at is
  'Null means in-flight, abandoned, or failed. Only a non-null value proves a packet was stored and emailed.';
comment on column public.trial_packet_generation_claims.last_error is
  'Why the most recent attempt failed. Retained deliberately: a released claim used to erase the only record that anything went wrong.';

-- "Which upcoming trial days have failed and never recovered?" — the question
-- an operator actually asks, and it should not be a full scan.
create index if not exists trial_packet_generation_claims_unresolved_idx
  on public.trial_packet_generation_claims (trial_date)
  where completed_at is null and failed_at is not null;

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

-- The packet is cut in each trial's OWN evening, not in a fixed UTC window.
--
-- The first draft ran 21:00-23:59 UTC and let the earliest run win, so the
-- shipped packet was always cut at 21:00 UTC = 16:00 CDT — the AFTERNOON
-- before, missing exactly the late scratches and movements the evening trigger
-- exists to capture. That is the same objection this migration uses to reject
-- an entry-close trigger, so leaving it would have been the argument applied
-- to everyone but ourselves. `public.trials.timezone` is populated on every
-- row, so this was a gap by omission rather than for lack of data.
--
-- The job wakes twice an hour and does nothing unless some trial is in its own
-- 18:00-21:59 local window on the eve of its date. Eight attempts per trial,
-- 30 minutes apart — comfortably above the 10-minute claim lease, so each run
-- can rescue what its predecessor abandoned. A completed day exits after one
-- indexed read, so the empty runs cost almost nothing.
--
-- The chain still ends: a crash during the last local attempt misses that
-- trial's packet, which is what phase 5's print reminder is for, since it keys
-- on paperwork_prints rather than on our own success.
-- Takes its credentials as ARGUMENTS rather than reading Vault itself, so the
-- cron command carries the `vault.decrypted_secrets where name = '...'` text
-- that `list_cron_vault_secret_refs()` greps for. Reading them inside this
-- body would hide the dependency from `audit_cron_vault_secrets()` — the guard
-- that exists precisely to catch a cron job whose secret is missing or was
-- rotated away. The values are computed at call time, so no secret ever
-- appears in the stored command text.
create or replace function public.request_trial_packet_generation(
  p_base_url text,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  local_now timestamp;
begin
  -- Fail loudly rather than posting unauthenticated requests all evening.
  if nullif(p_base_url, '') is null or nullif(p_secret, '') is null then
    raise exception 'Missing Vault secret: edge_function_base_url or packet_cron_secret';
  end if;

  -- One request per (show, day), not per trial: a Sunday running three trials
  -- is ONE packet holding three trial sections. The date bound is +/- 2 days
  -- so it covers every timezone offset while still using the index.
  for rec in
    select distinct
      t.show_id,
      t.date,
      coalesce(nullif(btrim(t.timezone), ''), 'UTC') as tz
    from public.trials t
    join public.shows s on s.id = t.show_id
    where t.date between current_date - 1 and current_date + 2
      and t.deleted_at is null
      and s.deleted_at is null
      and coalesce(t.status, '') <> 'cancelled'
      -- 'draft' as well as 'cancelled': shows_status_check permits
      -- ('draft','published','upcoming','in_progress','completed','cancelled'),
      -- and a DRAFT show is not a real event. Generating for one emails its
      -- officials a packet for a show that was never published. A denylist
      -- rather than an allowlist on purpose — a status added later should
      -- default to getting paper, because a missing packet is caught by the
      -- print reminder while a wrongly-sent one cannot be unsent.
      and coalesce(s.status, '') not in ('draft', 'cancelled')
  loop
    -- A malformed timezone raises, and one bad row must not kill the run for
    -- every other show. Falling back to UTC reproduces the old behaviour for
    -- that row rather than skipping it, because a packet in the wrong hour
    -- still beats no packet.
    begin
      local_now := timezone(rec.tz, now());
    exception when others then
      local_now := timezone('UTC', now());
    end;

    continue when rec.date <> (local_now::date + 1);
    continue when extract(hour from local_now) not between 18 and 21;

    -- The function authenticates on PACKET_CRON_SECRET and builds its own
    -- service-role client from its environment, so no key travels here.
    perform net.http_post(
      url := p_base_url || '/generate-trial-packet',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || p_secret
      ),
      body := jsonb_build_object(
        'showId', rec.show_id,
        'trialDate', to_char(rec.date, 'YYYY-MM-DD')
      ),
      -- pg_net defaults to 5s, and rendering a three-trial Sunday (~110
      -- pages) plus upload plus email is comfortably longer. The worker
      -- abandoning the connection mid-render risks the edge runtime tearing
      -- down the isolate, leaving a claim held with no packet behind it. This
      -- does NOT block the cron transaction: pg_net dispatches through a
      -- background worker.
      timeout_milliseconds := 120000
    );
  end loop;
end;
$$;

comment on function public.request_trial_packet_generation(text, text) is
  'MYK9-228: cron entry point. Asks generate-trial-packet for any trial day whose own evening it currently is.';

-- Reads Vault, so no client role may call it.
revoke all on function public.request_trial_packet_generation(text, text) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'trial-packet-show-eve';

-- Scheduled ONLY once the secret it depends on exists.
--
-- `list_cron_vault_secret_refs()` regexes `cron.job.command` for
-- `vault.decrypted_secrets where name = '...'`, and
-- `cron-vault-secrets.integration.test.ts` asserts nothing references a
-- missing secret. Scheduling before `packet_cron_secret` is created would turn
-- that green contract test red AND leave the job raising into a void twice an
-- hour. So the vault read stays INLINE in the command — hiding it inside a
-- function body would evade the very guard that catches this — and the
-- schedule waits for the secret.
do $schedule$
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'packet_cron_secret') then
    perform cron.schedule(
      'trial-packet-show-eve',
      '10,40 * * * *',
      $job$
      select public.request_trial_packet_generation(
        (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_base_url'),
        (select decrypted_secret from vault.decrypted_secrets where name = 'packet_cron_secret')
      );
      $job$
    );
  else
    raise warning '%',
      'packet_cron_secret is not in Vault, so trial-packet-show-eve was NOT scheduled. '
      'Create it and the matching PACKET_CRON_SECRET function secret, then re-run the '
      'cron.schedule call in 20260822120000_trial_packet_cron.sql.';
  end if;
end
$schedule$;
