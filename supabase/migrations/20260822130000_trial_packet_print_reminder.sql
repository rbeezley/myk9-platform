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

-- Two slots, both targeting `current_date` — the trial day itself:
--   01:00 UTC = evening BEFORE across US time zones (8pm EDT / 5pm PDT the
--               previous day), and safely after generation, which runs
--               21:00-23:59 UTC targeting `current_date + 1`.
--   12:00 UTC = the morning OF (8am EDT / 5am PDT), the last moment paper can
--               still reach the box.
-- Deliberately not MYK9-198's original "48h out, daily": the evening-before
-- regeneration supersedes anything printed earlier, so nagging before the
-- packet is current asks for a print that will be stale by the trial.
create or replace function public.request_trial_packet_print_reminders(p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  edge_function_base_url text;
  packet_secret text;
  rec record;
begin
  select decrypted_secret into edge_function_base_url
  from vault.decrypted_secrets where name = 'edge_function_base_url';
  select decrypted_secret into packet_secret
  from vault.decrypted_secrets where name = 'packet_cron_secret';

  -- Fail loudly rather than posting unauthenticated requests twice a day.
  if nullif(edge_function_base_url, '') is null
     or nullif(packet_secret, '') is null then
    raise exception 'Missing Vault secret: edge_function_base_url or packet_cron_secret';
  end if;

  -- One request per (show, day). The function decides whether to actually
  -- send: it checks that a packet exists and that no confirmation covers the
  -- day, so the schedule stays dumb and the decision stays testable.
  for rec in
    select distinct t.show_id, t.date
    from public.trials t
    join public.shows s on s.id = t.show_id
    where t.date = current_date
      and t.deleted_at is null
      and s.deleted_at is null
      and coalesce(t.status, '') <> 'cancelled'
      and coalesce(s.status, '') not in ('draft', 'cancelled')
  loop
    perform net.http_post(
      url := edge_function_base_url || '/remind-print-trial-packet',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || packet_secret
      ),
      body := jsonb_build_object(
        'showId', rec.show_id,
        'trialDate', to_char(rec.date, 'YYYY-MM-DD'),
        'kind', p_kind
      ),
      timeout_milliseconds := 60000
    );
  end loop;
end;
$$;

comment on function public.request_trial_packet_print_reminders(text) is
  'MYK9-228: cron entry point. Asks remind-print-trial-packet to consider every show running today.';

-- Definer, and it reads Vault — so it must not be callable by a client role.
revoke all on function public.request_trial_packet_print_reminders(text) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job
where jobname in ('trial-packet-print-reminder-evening', 'trial-packet-print-reminder-morning');

select cron.schedule(
  'trial-packet-print-reminder-evening',
  '0 1 * * *',
  $evening$select public.request_trial_packet_print_reminders('evening-before');$evening$
);

select cron.schedule(
  'trial-packet-print-reminder-morning',
  '0 12 * * *',
  $morning$select public.request_trial_packet_print_reminders('morning-of');$morning$
);
