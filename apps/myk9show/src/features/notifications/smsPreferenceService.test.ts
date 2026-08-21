import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSmsConsent,
  isValidSmsConsent,
  loadSmsNotificationPreference,
  requestSmsOptIn,
  setRingAlertsEnabled,
  setSmsDeliveryEnabled,
} from './smsPreferenceService';

const { maybeSingle, selectEq, select, updateEq, update, insert, invoke } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const updateEq = vi.fn();
  const update = vi.fn(() => ({ eq: updateEq }));
  return { maybeSingle, selectEq, select, updateEq, update, insert: vi.fn(), invoke: vi.fn() };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select, update, insert })),
    functions: { invoke },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({ data: null, error: null });
  updateEq.mockResolvedValue({ error: null });
  insert.mockResolvedValue({ error: null });
  invoke.mockResolvedValue({ data: { status: 'enabled', phone: '+12105550142' }, error: null });
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
    expect(insert).toHaveBeenCalledWith({ auth_user_id: 'user-1', upcoming_runs: false });
  });

  it('updates the existing per-user row for the outer ring-alert switch', async () => {
    maybeSingle.mockResolvedValue({ data: { auth_user_id: 'user-1' }, error: null });
    await expect(setRingAlertsEnabled('user-1', true)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ upcoming_runs: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it('reports outer ring-alert read failures without throwing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(setRingAlertsEnabled('user-1', true)).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('turns in-app SMS off without clearing consent columns', async () => {
    await expect(setSmsDeliveryEnabled('user-1', false)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ sms_enabled: false });
  });

  it('clears every consent field when the number changes', async () => {
    await expect(clearSmsConsent('user-1')).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({
      sms_enabled: false,
      sms_phone_e164: null,
      sms_opt_in_at: null,
      sms_consent_text_version: null,
      sms_opt_in_source: null,
      sms_opt_out_at: null,
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
    } as const;
    expect(isValidSmsConsent(valid, '(210) 555-0142')).toBe(true);
    expect(
      isValidSmsConsent({ ...valid, sms_opt_out_at: '2026-08-21T21:00:00Z' }, valid.sms_phone_e164)
    ).toBe(false);
    expect(isValidSmsConsent(valid, '2105559999')).toBe(false);
  });
});
