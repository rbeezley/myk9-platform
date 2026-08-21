import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../migrations/20260821230000_harden_notification_preferences_sms.sql'),
  'utf8'
);
const endpoint = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
const smsPreferenceService = readFileSync(
  resolve(__dirname, '../../../apps/myk9show/src/features/notifications/smsPreferenceService.ts'),
  'utf8'
);
const preferenceSync = readFileSync(
  resolve(
    __dirname,
    '../../../apps/myk9show/src/features/notifications/notificationPreferenceSync.ts'
  ),
  'utf8'
);

describe('notification preference and SMS consent security migration', () => {
  it('removes direct authenticated mutation and replaces the permissive FOR ALL policy', () => {
    expect(migration).toContain('drop policy if exists notification_preferences_user_access');
    expect(migration).toContain('create policy notification_preferences_select_own');
    expect(migration).toContain(
      'revoke insert, update, delete on table public.notification_preferences from authenticated'
    );
    expect(migration).toContain(
      'on table public.notification_preferences from authenticated, anon'
    );
    expect(migration).not.toContain(
      'grant select, insert, update, delete on table public.notification_preferences to authenticated'
    );
  });

  it('derives client mutation ownership from auth.uid and exposes only bounded RPCs', () => {
    expect(migration).toContain('v_auth_user_id uuid := auth.uid()');
    expect(migration).toContain(
      'revoke all on function public.set_my_notification_preferences(boolean, smallint, boolean, boolean)'
    );
    expect(migration).toContain(
      'revoke all on function public.clear_my_sms_consent(text, timestamptz, uuid)'
    );
    expect(migration).toContain('to authenticated, service_role');
    expect(smsPreferenceService).toContain("rpc('set_my_notification_preferences'");
    expect(smsPreferenceService).toContain("rpc('clear_my_sms_consent'");
    expect(preferenceSync).toContain("'set_my_notification_preferences'");
    expect(preferenceSync).not.toContain(".from('notification_preferences')");
  });

  it('requires a write token and compare-and-clears every exact consent identity field', () => {
    expect(migration).toContain('sms_consent_write_token is not null');
    expect(endpoint).toContain(".eq('sms_consent_write_token', write.sms_consent_write_token)");
    expect(endpoint).toContain(".eq('sms_phone_e164', write.sms_phone_e164)");
    expect(endpoint).toContain(".eq('sms_opt_in_at', write.sms_opt_in_at)");
    expect(endpoint).toContain(".select('auth_user_id')");
    expect(endpoint).toContain('.maybeSingle()');
  });

  it('uses a service-role-only serialized account and destination rate-limit claim', () => {
    expect(migration).toContain("'sms-opt-in-account:' || p_auth_user_id::text");
    expect(migration).toContain("'sms-opt-in-phone:' || p_phone_e164");
    expect(migration).toContain('if v_account_count >= 3 or v_phone_count >= 3 then');
    expect(migration).toContain(
      'revoke all on function public.claim_sms_opt_in_attempt(uuid, text)'
    );
    expect(migration).toContain('to service_role');
    expect(endpoint).toContain("supabase.rpc('claim_sms_opt_in_attempt'");
  });
});
