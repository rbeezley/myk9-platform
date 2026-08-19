-- MYK9-203 (PR 2) — show-eve offline-priming nudge.
--
-- The evening before a trial day, `push-trigger-show-eve` reminds the people
-- who will RUN that day to open the show while they still have internet. This
-- table is the idempotency ledger: one row per (trial, recipient) that was
-- actually notified, so a cron re-run in the same window cannot buzz anyone
-- twice. The function CLAIMS a pair before sending, stamps delivered_at only
-- on a real delivery, and releases the claim when nothing was delivered — so a
-- crashed run costs one cycle instead of suppressing that person forever.

create table if not exists public.show_eve_nudge_log (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.trials (id) on delete cascade,
  auth_user_id uuid not null,
  -- Claim time, written before the send attempt.
  claimed_at timestamptz not null default now(),
  -- Set only after a push is actually delivered. A row with a NULL here is a
  -- claim whose run may have crashed mid-send; the function reclaims it after
  -- a lease window rather than treating the unique conflict as "already sent"
  -- and silently suppressing that person's nudge forever.
  delivered_at timestamptz,
  constraint show_eve_nudge_log_unique_pair unique (trial_id, auth_user_id)
);

comment on table public.show_eve_nudge_log is
  'MYK9-203: idempotency ledger for the show-eve offline-priming push. One row per (trial, recipient); delivered_at distinguishes a completed send from an abandoned claim.';

-- Recipients are only ever looked up per trial when the cron runs.
create index if not exists show_eve_nudge_log_trial_idx
  on public.show_eve_nudge_log (trial_id);

-- This ledger is written and read exclusively by the edge function running as
-- service_role. No client role has any business touching it, and per this
-- repo's ALTER DEFAULT PRIVILEGES, anon would otherwise receive full CRUD on a
-- newly created public table — so the REVOKEs below are REQUIRED, not tidy-up.
alter table public.show_eve_nudge_log enable row level security;
-- FORCE so even a table owner is subject to the policy below; without it the
-- migrations-only rebuild owner reads and writes freely.
alter table public.show_eve_nudge_log force row level security;

revoke all on public.show_eve_nudge_log from anon;
revoke all on public.show_eve_nudge_log from authenticated;
-- The function INSERTs a claim, SELECTs an existing claim to judge whether it
-- is a stale lease, UPDATEs it on delivery, and DELETEs it when nothing was
-- delivered.
grant select, insert, update, delete on public.show_eve_nudge_log to service_role;

-- Explicit deny-all rather than relying on "RLS enabled with no policies":
-- the disposition is then visible in the SQL and enforced even if a future
-- migration grants a client role by accident. service_role bypasses RLS.
create policy show_eve_nudge_log_deny_all
  on public.show_eve_nudge_log
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Repeatedly through the 23:00 UTC hour — evening across US time zones,
-- i.e. the night before the trial. Repeats are nearly free (a delivered pair
-- is skipped on sight) and they are what makes the claim lease meaningful: a
-- run that crashes or finds no subscription at 23:00 gets retried at 23:15,
-- rather than the failure waiting for a tomorrow that never comes for this
-- trial. Per-trial timezone precision is a deliberate follow-up; a nudge that
-- lands an hour early still does its job.
--
-- The trailing :55 run exists so the :45 run also has a successor able to
-- reclaim a claim it abandoned. The chain has to end somewhere: a crash during
-- the final run of the window misses that trial's nudge, because once the
-- clock passes midnight no run targets this trial date again.
select cron.unschedule(jobid) from cron.job where jobname = 'show-eve-offline-nudge';

select cron.schedule(
  'show-eve-offline-nudge',
  '0,15,30,45,55 23 * * *',
  $show_eve_nudge$
  do $nudge$
  declare
    edge_function_base_url text;
    push_secret text;
  begin
    select decrypted_secret into edge_function_base_url
    from vault.decrypted_secrets where name = 'edge_function_base_url';
    select decrypted_secret into push_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';
    -- The function authenticates on PUSH_WEBHOOK_SECRET and builds its own
    -- service-role client from its environment, so no key travels in this call.
    perform net.http_post(
      url := edge_function_base_url || '/push-trigger-show-eve',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || push_secret
      ),
      body := '{}'::jsonb
    );
  end
  $nudge$;
  $show_eve_nudge$
);
