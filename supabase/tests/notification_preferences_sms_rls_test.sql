-- Adversarial behavioral coverage for 20260821230000_harden_notification_preferences_sms.sql.
-- All fixtures and mutations roll back.

begin;

insert into public.notification_preferences (
  id,
  auth_user_id,
  upcoming_runs,
  sms_enabled,
  sms_phone_e164,
  sms_opt_in_at,
  sms_consent_text_version,
  sms_opt_in_source,
  sms_opt_out_at,
  sms_consent_write_token
) values
  (
    '00000000-0000-0000-0000-000000000191',
    '00000000-0000-0000-0000-000000000191',
    true,
    true,
    '+12105550191',
    '2026-08-21T20:00:00Z',
    'sms-consent-v1',
    'account-settings',
    null,
    '00000000-0000-4000-8000-000000000191'
  ),
  (
    '00000000-0000-0000-0000-000000000192',
    '00000000-0000-0000-0000-000000000192',
    true,
    false,
    null,
    null,
    null,
    null,
    null,
    null
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000191', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000191',
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  v_visible_count integer;
begin
  select count(*) into v_visible_count from public.notification_preferences;
  if v_visible_count <> 1 then
    raise exception 'FAIL owner saw % preference rows; expected exactly one', v_visible_count;
  end if;
  raise notice 'PASS owner cannot read another account preference row';
end;
$$;

do $$
begin
  begin
    insert into public.notification_preferences (auth_user_id)
    values ('00000000-0000-0000-0000-000000000192');
    raise exception 'FAIL cross-account row planting succeeded';
  exception when insufficient_privilege then
    raise notice 'PASS direct cross-account row planting rejected';
  end;
end;
$$;

do $$
begin
  begin
    update public.notification_preferences
    set sms_phone_e164 = '+12105550999',
        sms_opt_in_at = now(),
        sms_consent_text_version = 'fabricated',
        sms_opt_in_source = 'fabricated',
        sms_consent_write_token = extensions.uuid_generate_v4(),
        sms_enabled = true;
    raise exception 'FAIL direct SMS consent fabrication succeeded';
  exception when insufficient_privilege then
    raise notice 'PASS direct SMS consent fabrication rejected';
  end;
end;
$$;

do $$
begin
  if not public.set_my_notification_preferences(false, 4::smallint, false, false) then
    raise exception 'FAIL legitimate preference RPC returned false';
  end if;
  if exists (
    select 1
    from public.notification_preferences
    where auth_user_id = auth.uid()
      and (upcoming_runs is distinct from false or lead_dogs <> 4 or push_enabled is distinct from false)
  ) then
    raise exception 'FAIL legitimate preference RPC did not update the owner row';
  end if;
  raise notice 'PASS legitimate caller-derived preference mutation succeeds';
end;
$$;

do $$
begin
  if public.clear_my_sms_consent(
    '+12105550191',
    '2026-08-21T20:00:00Z',
    '00000000-0000-4000-8000-000000000199'
  ) then
    raise exception 'FAIL stale write token cleared current consent';
  end if;
  if not exists (
    select 1 from public.notification_preferences
    where auth_user_id = auth.uid() and sms_consent_write_token = '00000000-0000-4000-8000-000000000191'
  ) then
    raise exception 'FAIL stale clear changed the current consent';
  end if;
  raise notice 'PASS stale compare-and-clear cannot erase current consent';
end;
$$;

rollback;
