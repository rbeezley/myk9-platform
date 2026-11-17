-- =============================================================================
-- MYK9-2112 (decision B of MYK9-2079): the "Paper fallback packet" switch
-- (shows.uses_paper_packet) controls the automatic packet and its reminder.
--
-- Until now the switch only hid a Show Desk row; the nightly cron and the
-- print reminder ignored it. Owner decisions, 2026-11-16:
--   * The cron and the reminder skip a show whose switch is off.
--   * The switch starts ON. Every upcoming published show had it off (the old
--     default), so gating alone would have stopped every nightly packet. New
--     shows default to on, and every existing show is turned on. A secretary
--     who does not want paper turns it off.
--
-- Both dispatchers are copied from their only definitions,
-- 20260822190000_trial_packet_cron.sql and
-- 20260822192000_trial_packet_print_reminder.sql (identical to the live
-- pg_get_functiondef on 2026-11-17), with one added predicate each.
-- CREATE OR REPLACE keeps the existing EXECUTE ACLs; the REVOKEs are restated
-- so the file stands on its own.
--
-- GRANTS: no table is created; public.shows keeps its table-level grants.
-- The UPDATE fires update_shows_updated_at, which bumps updated_at so
-- replicas re-pull the changed rows.
-- =============================================================================

BEGIN;

ALTER TABLE public.shows ALTER COLUMN uses_paper_packet SET DEFAULT true;

UPDATE public.shows SET uses_paper_packet = true WHERE uses_paper_packet = false;

COMMENT ON COLUMN public.shows.uses_paper_packet IS
  'MYK9-1685, MYK9-2112: the show keeps a paper fallback packet. When false, the nightly packet (request_trial_packet_generation), its print reminder (request_trial_packet_print_reminders) and the Saved copy section skip the show. Default true.';

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
  considered int := 0;
  dispatch_failures int := 0;
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
      -- MYK9-2112 (decision B of MYK9-2079): the "Paper fallback packet"
      -- switch in Edit show turns the automatic packet and its reminder off.
      and s.uses_paper_packet
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

    -- The POST is the statement most likely to raise (queue pressure, a bad
    -- URL), and the handler above covered only the timezone cast — so one bad
    -- row still lost every remaining show in the run. Recovered 30 minutes
    -- later, but the stated intent was that one bad row cannot do that.
    --
    -- The function authenticates on PACKET_CRON_SECRET and builds its own
    -- service-role client from its environment, so no key travels here.
    considered := considered + 1;
    begin
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
    exception when others then
      dispatch_failures := dispatch_failures + 1;
      raise warning 'trial packet POST failed for show % on %: %',
        rec.show_id, rec.date, sqlerrm;
    end;
  end loop;

  -- Per-row isolation must not turn a SYSTEMIC failure green.
  --
  -- Swallowing every raise means pg_cron records `status='succeeded'`, and
  -- `backgroundJobsCheck` escalates a job's `lastStatus='failed'` to a failing
  -- `/admin/health` — so a rotated `edge_function_base_url`, or EXECUTE on
  -- `net` revoked from this owner, would produce zero packets all evening
  -- behind a green board, and nobody would find out until a secretary had no
  -- paper. A `raise warning` only reaches the Postgres log, which nothing here
  -- reads. One bad row stays isolated; every row failing is an outage.
  if considered > 0 and dispatch_failures = considered then
    raise exception 'trial packet dispatch failed for all % show-day(s) this run', considered;
  end if;
end;
$$;

revoke all on function public.request_trial_packet_generation(text, text) from public, anon, authenticated;

create or replace function public.request_trial_packet_print_reminders(
  p_kind text,
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
  window_start int;
  window_end int;
  considered int := 0;
  dispatch_failures int := 0;
begin
  if nullif(p_base_url, '') is null or nullif(p_secret, '') is null then
    raise exception 'Missing Vault secret: edge_function_base_url or packet_cron_secret';
  end if;

  -- Local hours, not a fixed UTC hour. Generation fires in each trial's own
  -- 18:00-21:59; the evening chase follows it at 21:00-22:59 local, and the
  -- morning chase is 06:00-08:59 on the day itself — the last window in which
  -- paper can still reach the box.
  if p_kind = 'evening-before' then
    window_start := 21; window_end := 22;
  elsif p_kind = 'morning-of' then
    window_start := 6; window_end := 8;
  else
    raise exception 'Unknown reminder kind: %', p_kind;
  end if;

  -- One request per (show, day). The function decides whether to actually
  -- send: it checks that a packet exists and that no confirmation covers the
  -- day, so the schedule stays dumb and the decision stays testable.
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
      and coalesce(s.status, '') not in ('draft', 'cancelled')
      -- MYK9-2112 (decision B of MYK9-2079): the "Paper fallback packet"
      -- switch in Edit show turns the automatic packet and its reminder off.
      and s.uses_paper_packet
  loop
    -- One malformed timezone must not kill the chase for every other show.
    begin
      local_now := timezone(rec.tz, now());
    exception when others then
      local_now := timezone('UTC', now());
    end;

    -- The evening chase is the eve of the trial; the morning chase is the day.
    continue when rec.date <> (
      case when p_kind = 'evening-before' then local_now::date + 1 else local_now::date end
    );
    continue when extract(hour from local_now) not between window_start and window_end;

    -- The POST is the statement most likely to raise (queue pressure, a bad
    -- URL), and the handler above covered only the timezone cast — so one bad
    -- row still lost every remaining show in the run. Recovered 30 minutes
    -- later, but the stated intent was that one bad row cannot do that.
    considered := considered + 1;
    begin
    perform net.http_post(
      url := p_base_url || '/remind-print-trial-packet',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || p_secret
      ),
      body := jsonb_build_object(
        'showId', rec.show_id,
        'trialDate', to_char(rec.date, 'YYYY-MM-DD'),
        'kind', p_kind
      ),
      timeout_milliseconds := 60000
    );
    exception when others then
      dispatch_failures := dispatch_failures + 1;
      raise warning 'print reminder POST failed for show % on %: %',
        rec.show_id, rec.date, sqlerrm;
    end;
  end loop;

  -- Per-row isolation must not turn a SYSTEMIC failure green. Swallowing
  -- everything makes pg_cron record `succeeded`, and `backgroundJobsCheck`
  -- escalates a job's `lastStatus='failed'` to a failing /admin/health — so a
  -- rotated `edge_function_base_url` would silence every chase behind a green
  -- board. A `raise warning` reaches only the Postgres log, which nothing here
  -- reads. One bad row stays isolated; every row failing is an outage.
  if considered > 0 and dispatch_failures = considered then
    raise exception 'print reminder dispatch failed for all % show-day(s) this run', considered;
  end if;
end;
$$;

revoke all on function public.request_trial_packet_print_reminders(text, text, text) from public, anon, authenticated;

COMMIT;
