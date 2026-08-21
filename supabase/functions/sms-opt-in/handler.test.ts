import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSmsOptIn, type SmsConsentRow } from './handler';

const send = vi.fn();
const findByUserId = vi.fn();
const saveConsent = vi.fn();
const clearConsent = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  findByUserId.mockResolvedValue(null);
  saveConsent.mockResolvedValue(undefined);
  clearConsent.mockResolvedValue(undefined);
  send.mockResolvedValue({ messageId: 'SM123' });
});

function run(body: Record<string, unknown> = {}) {
  return handleSmsOptIn(
    {
      phone: '(210) 555-0142',
      consentTextVersion: 'sms-consent-v1',
      source: 'account-settings',
      ...body,
    },
    {
      authUserId: 'verified-user',
      now: () => new Date('2026-08-21T20:00:00.000Z'),
      provider: { send },
      preferences: { findByUserId, saveConsent, clearConsent },
    }
  );
}

describe('handleSmsOptIn', () => {
  it('normalizes and writes every consent field atomically before sending confirmation', async () => {
    await expect(run({ authUserId: 'attacker-chosen-user' })).resolves.toEqual({
      status: 'enabled',
      phone: '+12105550142',
    });

    expect(saveConsent).toHaveBeenCalledWith(
      {
        auth_user_id: 'verified-user',
        sms_enabled: true,
        sms_phone_e164: '+12105550142',
        sms_opt_in_at: '2026-08-21T20:00:00.000Z',
        sms_consent_text_version: 'sms-consent-v1',
        sms_opt_in_source: 'account-settings',
        sms_opt_out_at: null,
      },
      false
    );
    expect(send).toHaveBeenCalledWith({
      to: '+12105550142',
      body: "myK9Show: You're signed up for ring alerts. Msg & data rates may apply. Msg frequency varies. Reply HELP for help, STOP to cancel.",
    });
    expect(saveConsent.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
  });

  it('propagates the validated capture source instead of hardcoding it', async () => {
    await run({ source: 'entry-checkout' });
    expect(saveConsent).toHaveBeenCalledWith(
      expect.objectContaining({ sms_opt_in_source: 'entry-checkout' }),
      false
    );
  });

  it('updates the existing per-user row without relying on partial-index upsert inference', async () => {
    findByUserId.mockResolvedValue({
      sms_enabled: false,
      sms_phone_e164: null,
      sms_opt_in_at: null,
      sms_consent_text_version: null,
      sms_opt_in_source: null,
      sms_opt_out_at: null,
    } satisfies SmsConsentRow);

    await run();
    expect(saveConsent).toHaveBeenCalledWith(expect.any(Object), true);
  });

  it('rejects invalid input without reading or writing preferences or sending', async () => {
    await expect(run({ phone: '555-0142' })).rejects.toMatchObject({ status: 400 });
    expect(findByUserId).not.toHaveBeenCalled();
    expect(saveConsent).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not resend for already-active same-number consent', async () => {
    findByUserId.mockResolvedValue({
      sms_enabled: true,
      sms_phone_e164: '+12105550142',
      sms_opt_in_at: '2026-08-20T12:00:00.000Z',
      sms_consent_text_version: 'sms-consent-v1',
      sms_opt_in_source: 'account-settings',
      sms_opt_out_at: null,
    } satisfies SmsConsentRow);

    await expect(run()).resolves.toEqual({ status: 'already_enabled', phone: '+12105550142' });
    expect(saveConsent).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('clears consent when provider delivery fails', async () => {
    send.mockRejectedValue(new Error('network unavailable'));

    await expect(run()).rejects.toMatchObject({ status: 502 });
    expect(clearConsent).toHaveBeenCalledWith('verified-user');
  });
});
