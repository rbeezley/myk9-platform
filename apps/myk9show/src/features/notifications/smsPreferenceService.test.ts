import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSmsConsent,
  isValidSmsConsent,
  loadSmsNotificationPreference,
  requestSmsOptIn,
  setRingAlertsEnabled,
  setSmsDeliveryEnabled,
} from './smsPreferenceService';

const { maybeSingle, selectEq, select, rpc, invoke } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  return { maybeSingle, selectEq, select, rpc: vi.fn(), invoke: vi.fn() };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select })),
    rpc,
    functions: { invoke },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({ data: null, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  invoke.mockResolvedValue({
    data: {
      status: 'enabled',
      phone: '+12105550142',
      optInAt: '2026-08-21T20:00:00.000Z',
      writeToken: '00000000-0000-4000-8000-000000000191',
    },
    error: null,
  });
});

describe('SMS notification preferences', () => {
  it('loads the single per-user consent row', async () => {
    const row = { auth_user_id: 'user-1', sms_enabled: false, sms_phone_e164: null };
    maybeSingle.mockResolvedValue({ data: row, error: null });
    await expect(loadSmsNotificationPreference('user-1')).resolves.toBe(row);
    expect(selectEq).toHaveBeenCalledWith('auth_user_id', 'user-1');
  });

  it('sets the outer ring-alert switch through upcoming_runs', async () => {
    await expect(setRingAlertsEnabled('user-1', false)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('set_my_notification_preferences', {
      p_upcoming_runs: false,
    });
  });

  it('reports outer ring-alert read failures without throwing', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    await expect(setRingAlertsEnabled('user-1', true)).resolves.toBe(false);
  });

  it('turns in-app SMS off without clearing consent columns', async () => {
    await expect(setSmsDeliveryEnabled('user-1', false)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('set_my_notification_preferences', {
      p_sms_enabled: false,
    });
  });

  it('clears every consent field when the number changes', async () => {
    const preference = {
      auth_user_id: 'user-1',
      upcoming_runs: true,
      sms_enabled: false,
      sms_phone_e164: '+12105550142',
      sms_opt_in_at: '2026-08-21T20:00:00.000Z',
      sms_consent_text_version: 'sms-consent-v1',
      sms_opt_in_source: 'account-settings',
      sms_opt_out_at: null,
      sms_consent_write_token: '00000000-0000-4000-8000-000000000191',
    };
    await expect(clearSmsConsent('user-1', preference)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('clear_my_sms_consent', {
      p_expected_phone_e164: '+12105550142',
      p_expected_opt_in_at: '2026-08-21T20:00:00.000Z',
      p_expected_write_token: '00000000-0000-4000-8000-000000000191',
    });
  });

  it('passes the capture source to the opt-in endpoint', async () => {
    await requestSmsOptIn('(210) 555-0142', 'entry-checkout');
    expect(invoke).toHaveBeenCalledWith('sms-opt-in', {
      body: {
        phone: '(210) 555-0142',
        consentTextVersion: 'sms-consent-v1',
        source: 'entry-checkout',
      },
    });
  });

  it('requires complete same-number, non-opted-out consent', () => {
    const valid = {
      auth_user_id: 'user-1',
      upcoming_runs: true,
      sms_enabled: false,
      sms_phone_e164: '+12105550142',
      sms_opt_in_at: '2026-08-21T20:00:00Z',
      sms_consent_text_version: 'sms-consent-v1',
      sms_opt_in_source: 'account-settings',
      sms_opt_out_at: null,
      sms_consent_write_token: '00000000-0000-4000-8000-000000000191',
    } as const;
    expect(isValidSmsConsent(valid, '(210) 555-0142')).toBe(true);
    expect(
      isValidSmsConsent({ ...valid, sms_opt_out_at: '2026-08-21T21:00:00Z' }, valid.sms_phone_e164)
    ).toBe(false);
    expect(isValidSmsConsent(valid, '2105559999')).toBe(false);
  });
});
