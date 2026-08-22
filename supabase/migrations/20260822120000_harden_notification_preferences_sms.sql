-- MYK9-191: make notification preference ownership and SMS consent server-authoritative.
--
-- Inventory before this migration:
--   * 005 created one nullable user_id/auth_user_id row with all notification fields.
--   * 023 left one FOR ALL policy with USING only (no INSERT/UPDATE WITH CHECK).
--   * 20260730220000 granted authenticated table-wide SELECT/INSERT/UPDATE/DELETE.
--   * 20260816120000 added auth_user_id uniqueness and lead_dogs.
--   * 20260816140000 added consent columns but did not restrict their client writes.
--   * The only client writers are notificationPreferenceSync and Ring Alerts settings.
-- This migration replaces those client mutations with caller-derived RPCs and leaves the
-- service-role SMS endpoint as the only authority that can create consent evidence.

begin;

alter table public.notification_preferences
  add column if not exists sms_consent_write_token uuid;

-- Legacy bare sms_enabled=true rows are not defensible consent. Fail safe before adding
-- the stronger invariant; valid records receive a concurrency token for exact compensation.
update public.notification_preferences
set sms_enabled = false
where sms_enabled = true
  and (
    sms_phone_e164 is null
    or sms_opt_in_at is null
    or sms_consent_text_version is null
    or sms_opt_in_source is null
    or sms_opt_out_at is not null
  );

update public.notification_preferences
set sms_consent_write_token = extensions.uuid_generate_v4()
where sms_phone_e164 is not null
  and sms_opt_in_at is not null
  and sms_consent_text_version is not null
  and sms_opt_in_source is not null
  and sms_opt_out_at is null
  and sms_consent_write_token is null;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_sms_sendable_complete;

alter table public.notification_preferences
  add constraint notification_preferences_sms_sendable_complete
  check (
    sms_enabled is not true
    or (
      sms_phone_e164 is not null
      and sms_opt_in_at is not null
      and sms_consent_text_version is not null
      and sms_opt_in_source is not null
      and sms_opt_out_at is null
      and sms_consent_write_token is not null
    )
  );

comment on column public.notification_preferences.sms_consent_write_token is
  'Opaque version for compare-and-clear compensation. A failed older request cannot clear newer consent.';

-- Authenticated callers may read only their own row (or a legacy person-keyed row). All
-- mutation is through the RPCs below, which derive identity from auth.uid().
drop policy if exists notification_preferences_user_access
  on public.notification_preferences;
drop policy if exists notification_preferences_select_own
  on public.notification_preferences;

create policy notification_preferences_select_own
  on public.notification_preferences
  for select
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (
      auth_user_id is null
      and user_id = (select public.get_my_person_id())
    )
    or (select public.is_platform_admin())
  );

revoke insert, update, delete on table public.notification_preferences from authenticated;
-- Table-level REVOKE does not remove a drifted column grant. Restate every mutable
-- column explicitly so an older applied ACL cannot preserve a consent-writing path.
revoke insert (
  id, user_id, auth_user_id, entry_confirmations, schedule_changes,
  results_available, upcoming_runs, payment_receipts, promotional,
  push_enabled, email_enabled, sms_enabled, created_at, updated_at,
  lead_dogs, sms_phone_e164, sms_opt_in_at, sms_consent_text_version,
  sms_opt_in_source, sms_opt_out_at, sms_consent_write_token
), update (
  id, user_id, auth_user_id, entry_confirmations, schedule_changes,
  results_available, upcoming_runs, payment_receipts, promotional,
  push_enabled, email_enabled, sms_enabled, created_at, updated_at,
  lead_dogs, sms_phone_e164, sms_opt_in_at, sms_consent_text_version,
  sms_opt_in_source, sms_opt_out_at, sms_consent_write_token
) on table public.notification_preferences from authenticated, anon;
revoke select (
  id, user_id, auth_user_id, entry_confirmations, schedule_changes,
  results_available, upcoming_runs, payment_receipts, promotional,
  push_enabled, email_enabled, sms_enabled, created_at, updated_at,
  lead_dogs, sms_phone_e164, sms_opt_in_at, sms_consent_text_version,
  sms_opt_in_source, sms_opt_out_at, sms_consent_write_token
) on table public.notification_preferences from anon;
grant select on table public.notification_preferences to authenticated;
revoke all on table public.notification_preferences from anon;
grant select, insert, update, delete on table public.notification_preferences to service_role;

create or replace function public.set_my_notification_preferences(
  p_upcoming_runs boolean default null,
  p_lead_dogs smallint default null,
  p_push_enabled boolean default null,
  p_sms_enabled boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_person_id uuid;
  v_row public.notification_preferences%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_lead_dogs is not null and p_lead_dogs not between 1 and 5 then
    raise exception 'lead_dogs must be between 1 and 5' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('notification-preferences:' || v_auth_user_id::text, 0)
  );
  v_person_id := public.get_my_person_id();

  select np.*
  into v_row
  from public.notification_preferences np
  where np.auth_user_id = v_auth_user_id
     or (np.auth_user_id is null and np.user_id = v_person_id)
  order by (np.auth_user_id = v_auth_user_id) desc
  limit 1
  for update;

  if found then
    if p_sms_enabled = true and (
      v_row.sms_phone_e164 is null
      or v_row.sms_opt_in_at is null
      or v_row.sms_consent_text_version is null
      or v_row.sms_opt_in_source is null
      or v_row.sms_opt_out_at is not null
      or v_row.sms_consent_write_token is null
    ) then
      raise exception 'SMS cannot be enabled without active consent' using errcode = '23514';
    end if;

    update public.notification_preferences
    set auth_user_id = coalesce(auth_user_id, v_auth_user_id),
        upcoming_runs = coalesce(p_upcoming_runs, upcoming_runs),
        lead_dogs = coalesce(p_lead_dogs, lead_dogs),
        push_enabled = coalesce(p_push_enabled, push_enabled),
        sms_enabled = coalesce(p_sms_enabled, sms_enabled)
    where id = v_row.id;
  else
    if p_sms_enabled = true then
      raise exception 'SMS cannot be enabled without active consent' using errcode = '23514';
    end if;

    insert into public.notification_preferences (
      auth_user_id,
      upcoming_runs,
      lead_dogs,
      push_enabled,
      sms_enabled
    ) values (
      v_auth_user_id,
      coalesce(p_upcoming_runs, true),
      coalesce(p_lead_dogs, 3),
      coalesce(p_push_enabled, true),
      coalesce(p_sms_enabled, false)
    );
  end if;

  return true;
end;
$$;

create or replace function public.clear_my_sms_consent(
  p_expected_phone_e164 text,
  p_expected_opt_in_at timestamptz,
  p_expected_write_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_cleared_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.notification_preferences
  set sms_enabled = false,
      sms_phone_e164 = null,
      sms_opt_in_at = null,
      sms_consent_text_version = null,
      sms_opt_in_source = null,
      sms_opt_out_at = null,
      sms_consent_write_token = null
  where auth_user_id = v_auth_user_id
    and sms_phone_e164 = p_expected_phone_e164
    and sms_opt_in_at = p_expected_opt_in_at
    and sms_consent_write_token = p_expected_write_token
  returning id into v_cleared_id;

  return v_cleared_id is not null;
end;
$$;

revoke all on function public.set_my_notification_preferences(boolean, smallint, boolean, boolean)
  from public, anon;
grant execute on function public.set_my_notification_preferences(boolean, smallint, boolean, boolean)
  to authenticated, service_role;
revoke all on function public.clear_my_sms_consent(text, timestamptz, uuid)
  from public, anon;
grant execute on function public.clear_my_sms_consent(text, timestamptz, uuid)
  to authenticated, service_role;

-- Fixed-window confirmation throttling. The service-role-only claim is serialized for
-- both account and destination, allowing at most three actual send attempts per ten minutes.
create table if not exists public.sms_opt_in_attempts (
  id uuid primary key default extensions.uuid_generate_v4(),
  auth_user_id uuid not null,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  attempted_at timestamptz not null default now()
);

create index if not exists sms_opt_in_attempts_account_time_idx
  on public.sms_opt_in_attempts (auth_user_id, attempted_at desc);
create index if not exists sms_opt_in_attempts_phone_time_idx
  on public.sms_opt_in_attempts (phone_e164, attempted_at desc);

alter table public.sms_opt_in_attempts enable row level security;
alter table public.sms_opt_in_attempts force row level security;
revoke all on table public.sms_opt_in_attempts from public, anon, authenticated;
grant select, insert, delete on table public.sms_opt_in_attempts to service_role;

-- Explicit deny-all rather than relying on "RLS enabled with no policies": the
-- disposition is then visible in the SQL and still holds if a later migration
-- grants a client role by accident. service_role bypasses RLS, and
-- claim_sms_opt_in_attempt is SECURITY DEFINER, so neither path is affected.
create policy sms_opt_in_attempts_deny_all
  on public.sms_opt_in_attempts
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.claim_sms_opt_in_attempt(
  p_auth_user_id uuid,
  p_phone_e164 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := pg_catalog.now() - interval '10 minutes';
  v_account_count integer;
  v_phone_count integer;
begin
  if p_auth_user_id is null
     or p_phone_e164 is null
     or p_phone_e164 !~ '^\+[1-9][0-9]{6,14}$'
  then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sms-opt-in-account:' || p_auth_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sms-opt-in-phone:' || p_phone_e164, 0)
  );

  delete from public.sms_opt_in_attempts
  where attempted_at < pg_catalog.now() - interval '24 hours';

  select count(*) filter (where auth_user_id = p_auth_user_id),
         count(*) filter (where phone_e164 = p_phone_e164)
  into v_account_count, v_phone_count
  from public.sms_opt_in_attempts
  where attempted_at >= v_cutoff
    and (auth_user_id = p_auth_user_id or phone_e164 = p_phone_e164);

  if v_account_count >= 3 or v_phone_count >= 3 then
    return false;
  end if;

  insert into public.sms_opt_in_attempts (auth_user_id, phone_e164)
  values (p_auth_user_id, p_phone_e164);
  return true;
end;
$$;

revoke all on function public.claim_sms_opt_in_attempt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_sms_opt_in_attempt(uuid, text)
  to service_role;

commit;

notify pgrst, 'reload schema';
