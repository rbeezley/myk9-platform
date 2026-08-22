-- MYK9-228 phase 5: the reminder stops asking for a packet and asks for a PRINT.
--
-- Automation generates and emails; it cannot put paper in a box, and paper in
-- the box is the only thing that runs a trial whose laptop will not boot. So
-- the exit condition is `paperwork_prints` — NEVER the snapshot row. A packet
-- appearing in Storage every night is worth nothing on a dead laptop, and
-- measuring packet existence would show green while the real failure mode
-- stayed wide open.

create table if not exists public.trial_packet_print_reminders (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows (id) on delete cascade,
  trial_date date not null,
  -- The evening-before and morning-of sends are deliberately SEPARATE rows.
  -- Each is its own decision to chase, so suppressing one must not suppress
  -- the other — the morning send is the last moment this can be acted on.
  reminder_kind text not null check (reminder_kind in ('evening-before', 'morning-of')),
  -- Doubles as the CAS token. A claim with a null `sent_at` may belong to a
  -- run that died between the INSERT and the send — resolving recipients is
  -- two or three network round-trips — so after a lease another attempt takes
  -- it over. The first draft had a claim with no lease AND one cron run per
  -- slot, which meant releasing on failure achieved nothing: there was no
  -- later run to retry, and a crash stranded the slot forever.
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  recipient_count integer,
  constraint trial_packet_print_reminders_unique_send
    unique (show_id, trial_date, reminder_kind)
);

comment on table public.trial_packet_print_reminders is
  'MYK9-228: one row per (show, trial day, reminder slot) so a re-run cannot email the same chase twice.';
comment on column public.trial_packet_print_reminders.sent_at is
  'Null means claimed but not yet sent. The function releases the row rather than holding it when the send fails.';

alter table public.trial_packet_print_reminders enable row level security;
alter table public.trial_packet_print_reminders force row level security;

-- REQUIRED, not tidy-up: ALTER DEFAULT PRIVILEGES in this project grants anon
-- full CRUD on every newly created public table.
revoke all on public.trial_packet_print_reminders from anon;
revoke all on public.trial_packet_print_reminders from authenticated;
grant select, insert, update, delete on public.trial_packet_print_reminders to service_role;

create policy trial_packet_print_reminders_deny_all
  on public.trial_packet_print_reminders
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- The reminder needs "is there a non-voided packet confirmation for this show?"
-- and then filters by day in the function. `paperwork_prints_show_report_latest_idx`
-- already covers (show_id, report_id) where voided_at is null, so no new index.

-- Deliberately not MYK9-198's original "48h out, daily": the evening-before
-- regeneration supersedes anything printed earlier, so nagging before the
-- packet is current asks for a print that will be stale by the trial.
-- Takes its credentials as ARGUMENTS rather than reading Vault itself.
--
-- The first draft read them in this body, and that quietly evaded
-- `audit_cron_vault_secrets()`, which greps `cron.job.command` for
-- `vault.decrypted_secrets where name = '...'`. The generation cron read Vault
-- inline and was correctly flagged; this one was invisible — the tidier shape
-- was the one escaping the guard built to catch exactly a missing or rotated
-- secret. Values are computed at call time, so none appears in the stored
-- command text.
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

comment on function public.request_trial_packet_print_reminders(text, text, text) is
  'MYK9-228: cron entry point. Chases any trial day currently inside its own local reminder window.';

-- Definer, and it posts with a secret — so no client role may call it.
revoke all on function public.request_trial_packet_print_reminders(text, text, text)
  from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job
where jobname in ('trial-packet-print-reminder-evening', 'trial-packet-print-reminder-morning');

-- Twice an hour, like generation, so each slot gets several attempts and the
-- claim lease means something: releasing a failed send only helps if a later
-- run exists to pick it up. The first draft fired each slot exactly once, so
-- "a failed send releases the claim rather than burning the slot" was false —
-- there was nothing left to retry.
--
-- Scheduled only once `packet_cron_secret` exists: scheduling first would turn
-- `cron-vault-secrets.integration.test.ts` red and leave both jobs raising
-- into a void 96 times a day.
do $schedule$
declare
  kinds text[] := array['evening-before', 'morning-of'];
  kind text;
  jobname text;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'packet_cron_secret') then
    raise warning '%',
      'packet_cron_secret is not in Vault, so the print-reminder crons were NOT scheduled. '
      'Create it and the matching PACKET_CRON_SECRET function secret, then re-run the '
      'cron.schedule calls in 20260822130000_trial_packet_print_reminder.sql.';
    return;
  end if;

  foreach kind in array kinds loop
    jobname := 'trial-packet-print-reminder-' ||
      case when kind = 'evening-before' then 'evening' else 'morning' end;
    perform cron.schedule(
      jobname,
      '5,35 * * * *',
      format(
        $job$
        select public.request_trial_packet_print_reminders(
          %L,
          (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_base_url'),
          (select decrypted_secret from vault.decrypted_secrets where name = 'packet_cron_secret')
        );
        $job$,
        kind
      )
    );
  end loop;
end
$schedule$;
