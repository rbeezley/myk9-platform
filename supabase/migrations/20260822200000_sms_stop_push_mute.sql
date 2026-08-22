-- MYK9-192: inbound STOP/START handling for ring alerts.
--
-- Decision B (recorded on the issue): a STOP text mutes BOTH channels, not just
-- SMS. An exhibitor who texts STOP is signalling "stop buzzing my phone about
-- my dog", and the per-entry volume is one SMS against three pushes — muting
-- only the text barely changes what they experience, and they conclude we
-- ignored the opt-out.
--
-- The wrinkle B creates is restoring on START. If the exhibitor had already
-- turned ring alerts off themselves before texting STOP, blanket-restoring
-- `upcoming_runs` on START would switch on something they deliberately
-- switched off. So the STOP-initiated mute needs to be distinguishable from a
-- user-set one, which is what this column is for. It records only that the
-- webhook was the actor; START restores exactly what STOP took and nothing
-- more.

begin;

alter table public.notification_preferences
  add column if not exists sms_stop_muted_push_at timestamptz;

comment on column public.notification_preferences.sms_stop_muted_push_at is
  'Set by the sms-stop-webhook when an inbound STOP also turned upcoming_runs '
  'off, so a later START restores only the mute STOP applied. Null means '
  'upcoming_runs reflects the user''s own choice and START must leave it alone. '
  'Cleared whenever the user sets upcoming_runs themselves — after that their '
  'choice is the current one and STOP no longer owns the value.';

-- Column-level ACLs, restated for the new column.
--
-- `authenticated` holds table-level SELECT (granted in 20260822120000), so the
-- new column is readable by its owner through RLS without further action; the
-- settings screen must be able to see that a STOP muted push in order to
-- explain it. Writes are a different matter: this column records who the actor
-- was, so a client that could set it could forge that record. Every mutation
-- path for this table is a SECURITY DEFINER RPC or the service role, and
-- 20260822120000 revoked column-level INSERT/UPDATE for the columns that
-- existed then. A newly added column carries no grant of its own, but restate
-- it explicitly rather than relying on that: a drifted ACL is exactly the class
-- of bug this table's grants were hardened against.
revoke insert (sms_stop_muted_push_at), update (sms_stop_muted_push_at)
  on table public.notification_preferences from authenticated, anon;
revoke select (sms_stop_muted_push_at)
  on table public.notification_preferences from anon;

-- Re-created to clear the STOP marker when the user sets `upcoming_runs`
-- themselves. Without this the marker outlives the mute it describes: STOP
-- mutes push, the exhibitor turns ring alerts back on in the app, then later
-- turns them off deliberately — and a START would switch them on again,
-- overriding the deliberate choice. Once the user has set the value, STOP no
-- longer owns it.
--
-- Copied from 20260822120000 (the latest definition) with that one change.
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
        sms_enabled = coalesce(p_sms_enabled, sms_enabled),
        -- The user is setting this value now, so STOP no longer owns it.
        sms_stop_muted_push_at = case
          when p_upcoming_runs is null then sms_stop_muted_push_at
          else null
        end
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

commit;
