-- MYK9-2077: one reminder email, two days before a registry's results deadline, for a paperwork
-- line the secretary has not ticked. Phase 4b of docs/plan-show-closeout.md (parent MYK9-1945).
--
-- The date itself is never calculated here: the edge function `remind-registry-deadline` reads it
-- from supabase/functions/_shared/showCloseout/resultsDeadline.ts, the same module the Finish the
-- show list uses. This migration holds only the idempotency record and the hourly cron entry.
--
-- Deliberately NO foreign key to shows. A new FK edge from shows must be classified in the
-- hard_delete_show manifest, which means restating that whole function while other branches also
-- touch it. The row is a few bytes of bookkeeping, and permanent deletion is limited to unused
-- shows, so an orphan row costs nothing. The function only ever writes ids it has just read.

create table public.registry_deadline_reminders (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null,
  registry_id text not null check (registry_id in ('AKC', 'UKC', 'ASCA')),
  -- The date the Finish the show list shows for this registry. A show whose last trial day moves
  -- gets a new date, and so one new reminder for the new date.
  deadline_date date not null,
  -- Doubles as the compare-and-swap token for a claim that never reached a send (an isolate that
  -- died between the insert and the email). A null sent_at past the lease is taken over.
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  recipient_count integer,
  -- Lower-cased addresses the mail provider has ACCEPTED for this reminder. sent_at is stamped only
  -- once every intended recipient is in here; a later run mails just the addresses still missing.
  accepted_recipients text[] not null default '{}'::text[],
  constraint registry_deadline_reminders_one_per_deadline
    unique (show_id, registry_id, deadline_date)
);

comment on table public.registry_deadline_reminders is
  'MYK9-2077: one row per (show, registry, deadline date) so a re-run cannot email the same reminder twice. Written only by the remind-registry-deadline edge function (service role).';
comment on column public.registry_deadline_reminders.sent_at is
  'Null means claimed but not yet sent to everyone. The function releases the row when no send was accepted; a partly accepted row is kept and finished by a later run (accepted_recipients).';
comment on column public.registry_deadline_reminders.accepted_recipients is
  'Lower-cased addresses the provider accepted. A later run sends only to intended recipients not listed here.';

alter table public.registry_deadline_reminders enable row level security;
alter table public.registry_deadline_reminders force row level security;

-- REQUIRED: default privileges in this project grant anon full CRUD on every new public table.
revoke all on public.registry_deadline_reminders from public, anon, authenticated;
grant select, insert, update, delete on public.registry_deadline_reminders to service_role;

create policy registry_deadline_reminders_deny_all
  on public.registry_deadline_reminders
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Cron entry point. Takes its credentials as ARGUMENTS (not read from Vault in the body) so the
-- stored cron command names the secrets and `audit_cron_vault_secrets()` can see them, the same
-- shape as request_trial_packet_print_reminders. One POST per run: the function scans the shows
-- itself, because it must apply the shared deadline calculation in TypeScript.
create or replace function public.request_registry_deadline_reminders(
  p_base_url text,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(p_base_url, '') is null or nullif(p_secret, '') is null then
    raise exception 'Missing Vault secret: edge_function_base_url or packet_cron_secret';
  end if;

  perform net.http_post(
    url := p_base_url || '/remind-registry-deadline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

comment on function public.request_registry_deadline_reminders(text, text) is
  'MYK9-2077: cron entry point. Asks remind-registry-deadline to send any reminder that is due.';

-- Definer, and it posts with a secret, so no client role may call it.
revoke all on function public.request_registry_deadline_reminders(text, text)
  from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'registry-deadline-reminder';

-- Hourly, not daily: "two days before" is counted in each show's own time zone, so the day turns
-- over at a different hour for every show. The claim row makes the extra runs free.
-- Scheduled only once `packet_cron_secret` exists (the same secret and trust boundary as the
-- packet reminders); scheduling first would turn cron-vault-secrets.integration.test.ts red.
do $schedule$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'packet_cron_secret') then
    raise warning '%',
      'packet_cron_secret is not in Vault, so the registry-deadline-reminder cron was NOT scheduled. '
      'Create it and the matching PACKET_CRON_SECRET function secret, then re-run the '
      'cron.schedule call in 20261119013900_myk9_2077_registry_deadline_reminders.sql.';
    return;
  end if;

  perform cron.schedule(
    'registry-deadline-reminder',
    '20 * * * *',
    $job$
    select public.request_registry_deadline_reminders(
      (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_base_url'),
      (select decrypted_secret from vault.decrypted_secrets where name = 'packet_cron_secret')
    );
    $job$
  );
end
$schedule$;
