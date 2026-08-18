-- =============================================================================
-- Migration 20260816120000: server-side "you're N dogs away" push.
--
-- The proximity alert already existed, but it was sent FROM THE BROWSER by
-- useNotificationMonitor, gated on `document.visibilityState !== 'visible'`.
-- That requires the PWA process to be alive and merely backgrounded; iOS Safari
-- suspends backgrounded PWAs aggressively, so an exhibitor with the phone in
-- their pocket at the crate — the entire point of the feature — received
-- nothing. The client now delivers in-app only and this trigger owns push.
--
-- Two parts:
--   1. notification_preferences.lead_dogs — the "alert me when N dogs out"
--      threshold, previously client-only (zustand -> localStorage), which a
--      server-side sender cannot read.
--   2. notify_run_proximity_push() on entries — fires the edge function when an
--      entry enters the ring, i.e. when the queue behind it advances.
--
-- Vault secrets required (same handshake as notify_announcement_push):
--   edge_function_base_url, push_webhook_secret
-- Missing config raises a notice and skips — it must never abort the UPDATE
-- that a steward is making at ringside.
--
-- Grants: notification_preferences carries table-level GRANT SELECT, INSERT,
-- UPDATE, DELETE to authenticated (20260730220000 section 2) with no column
-- allowlist, so the new column inherits access. anon holds nothing here and
-- must continue to.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Per-user lead-dogs threshold
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  add column if not exists lead_dogs smallint not null default 3;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notification_preferences'::regclass
      and conname = 'notification_preferences_lead_dogs_range'
  ) then
    alter table public.notification_preferences
      add constraint notification_preferences_lead_dogs_range
      check (lead_dogs between 1 and 5);
  end if;
end $$;

comment on column public.notification_preferences.lead_dogs is
  'How many dogs out to alert at (1-5). Mirrors the client notificationStore leadDogs preference so push works while the PWA is closed.';

-- The table has been unused since 005 created it: nothing read or wrote it, so
-- auth_user_id is unpopulated and carries neither a unique constraint nor an
-- index. The trigger below looks users up BY auth_user_id, and the settings UI
-- upserts on it, so both need one. Partial (auth_user_id is nullable, and the
-- legacy UNIQUE(user_id) still governs people-keyed rows).
create unique index if not exists notification_preferences_auth_user_id_key
  on public.notification_preferences (auth_user_id)
  where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Run-proximity webhook
-- ---------------------------------------------------------------------------
create or replace function public.notify_run_proximity_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  edge_function_base_url text;
  webhook_secret text;
begin
  -- Defense in depth: the CREATE TRIGGER below already filters on the
  -- transition INTO the ring via WHEN, so Postgres never enters this function
  -- for the other check_in_status values an entry cycles through.
  if new.check_in_status is distinct from 'in-ring'
     or old.check_in_status is not distinct from 'in-ring'
  then
    return new;
  end if;

  select decrypted_secret
  into edge_function_base_url
  from vault.decrypted_secrets
  where name = 'edge_function_base_url';

  select decrypted_secret
  into webhook_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret';

  if nullif(edge_function_base_url, '') is null
    or nullif(webhook_secret, '') is null
  then
    raise notice 'notify_run_proximity_push skipped because edge function config is not set';
    return new;
  end if;

  -- An AFTER UPDATE trigger that raises rolls back the triggering UPDATE, so a
  -- net.http_post failure here would fail the steward's ring check-in at the
  -- worst possible moment. A missed push is recoverable; a refused check-in is
  -- not. Swallow and warn.
  begin
    perform net.http_post(
      url := edge_function_base_url || '/push-trigger-run-proximity',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || webhook_secret
      ),
      body := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'entries',
        'record', jsonb_build_object(
          'id', new.id,
          'class_id', new.class_id,
          'show_id', new.show_id,
          'check_in_status', new.check_in_status
        ),
        'old_record', jsonb_build_object(
          'id', old.id,
          'check_in_status', old.check_in_status
        )
      )
    );
  exception when others then
    raise warning 'notify_run_proximity_push: net.http_post failed: %', sqlerrm;
  end;

  return new;
end;
$$;

comment on function public.notify_run_proximity_push() is
  'Fires push-trigger-run-proximity when an entry enters the ring so the dogs behind it get their "N dogs away" push even with the PWA closed.';

-- Explicit EXECUTE decision (20260728120000 grant-regrowth guard). This is a
-- SECURITY DEFINER trigger function that reads Vault secrets — only the trigger
-- may invoke it, never a client role directly.
revoke execute on function public.notify_run_proximity_push() from public, anon, authenticated;

drop trigger if exists entries_run_proximity_push on public.entries;
-- WHEN filters in the trigger definition, not the function body: an entry
-- cycles through several check_in_status values per class, and this way
-- Postgres skips the PL/pgSQL call entirely for all of them but the one that
-- matters. Mirrors trg_notify_entry_scoring_push (20260703122000).
create trigger entries_run_proximity_push
  after update of check_in_status on public.entries
  for each row
  when (
    new.check_in_status = 'in-ring'
    and old.check_in_status is distinct from 'in-ring'
  )
  execute function public.notify_run_proximity_push();

commit;
