import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSmsOptIn, type SmsConsentRow } from './handler';

const send = vi.fn();
const findByUserId = vi.fn();
const saveConsent = vi.fn();
const clearConsent = vi.fn();
const claim = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  findByUserId.mockResolvedValue(null);
  saveConsent.mockResolvedValue(true);
  clearConsent.mockResolvedValue(true);
  claim.mockResolvedValue(true);
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
      createWriteToken: () => '00000000-0000-4000-8000-000000000191',
      now: () => new Date('2026-08-21T20:00:00.000Z'),
      provider: { send },
      preferences: { findByUserId, saveConsent, clearConsent },
      rateLimit: { claim },
    }
  );
}

describe('handleSmsOptIn', () => {
  it('normalizes and writes every consent field atomically before sending confirmation', async () => {
    await expect(run({ authUserId: 'attacker-chosen-user' })).resolves.toEqual({
      status: 'enabled',
      phone: '+12105550142',
      optInAt: '2026-08-21T20:00:00.000Z',
      writeToken: '00000000-0000-4000-8000-000000000191',
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
        sms_consent_write_token: '00000000-0000-4000-8000-000000000191',
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
      sms_consent_write_token: null,
    } satisfies SmsConsentRow);

    await run();
    expect(saveConsent).toHaveBeenCalledWith(expect.any(Object), true);
  });

  it('rejects invalid input without reading or writing preferences or sending', async () => {
    await expect(run({ phone: '555-0142' })).rejects.toMatchObject({ status: 400 });
    expect(findByUserId).not.toHaveBeenCalled();
    expect(saveConsent).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it('does not send when a concurrent delete makes the atomic update affect zero rows', async () => {
    findByUserId.mockResolvedValue({
      sms_enabled: false,
      sms_phone_e164: null,
      sms_opt_in_at: null,
      sms_consent_text_version: null,
      sms_opt_in_source: null,
      sms_opt_out_at: null,
      sms_consent_write_token: null,
    } satisfies SmsConsentRow);
    saveConsent.mockResolvedValue(false);

    await expect(run()).rejects.toMatchObject({ status: 409 });
    expect(send).not.toHaveBeenCalled();
  });

  it('rate-limits confirmation sends before writing consent', async () => {
    claim.mockResolvedValue(false);
    await expect(run()).rejects.toMatchObject({ status: 429 });
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
      sms_consent_write_token: '00000000-0000-4000-8000-000000000190',
    } satisfies SmsConsentRow);

    await expect(run()).resolves.toEqual({
      status: 'already_enabled',
      phone: '+12105550142',
      optInAt: '2026-08-20T12:00:00.000Z',
      writeToken: '00000000-0000-4000-8000-000000000190',
    });
    expect(saveConsent).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it('clears consent when provider delivery fails', async () => {
    send.mockRejectedValue(new Error('network unavailable'));

    await expect(run()).rejects.toMatchObject({ status: 502 });
    expect(clearConsent).toHaveBeenCalledWith(
      'verified-user',
      expect.objectContaining({
        sms_phone_e164: '+12105550142',
        sms_opt_in_at: '2026-08-21T20:00:00.000Z',
        sms_consent_write_token: '00000000-0000-4000-8000-000000000191',
      })
    );
  });

  it('cannot let an older failed send erase a newer consent write', async () => {
    let storedToken = '';
    saveConsent.mockImplementation(async values => {
      storedToken = values.sms_consent_write_token;
      return true;
    });
    send.mockImplementation(async () => {
      storedToken = '00000000-0000-4000-8000-000000000192';
      throw new Error('older request timed out');
    });
    clearConsent.mockImplementation(async (_authUserId, write) => {
      if (storedToken !== write.sms_consent_write_token) return false;
      storedToken = '';
      return true;
    });

    await expect(run()).rejects.toMatchObject({ status: 502 });
    expect(storedToken).toBe('00000000-0000-4000-8000-000000000192');
  });
});
