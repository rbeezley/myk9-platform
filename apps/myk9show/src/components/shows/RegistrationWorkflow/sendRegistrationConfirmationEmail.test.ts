import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: invokeMock } } }));

import { sendRegistrationConfirmationEmail } from './sendRegistrationConfirmationEmail';

describe('sendRegistrationConfirmationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is ok when the function reports success', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    expect(await sendRegistrationConfirmationEmail('reg-1')).toEqual({ ok: true });
  });

  it('sends the submitted entry ids with a submission, and only the registration for a resend', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    await sendRegistrationConfirmationEmail('reg-1', ['e1', 'e2']);
    expect(invokeMock).toHaveBeenLastCalledWith('send-registration-email', {
      body: { registrationId: 'reg-1', entryIds: ['e1', 'e2'] },
    });
    await sendRegistrationConfirmationEmail('reg-1');
    expect(invokeMock).toHaveBeenLastCalledWith('send-registration-email', {
      body: { registrationId: 'reg-1' },
    });
  });

  it('fails when the function answers 200 with success false (mail provider failed)', async () => {
    invokeMock.mockResolvedValue({ data: { success: false, error: 'resend 422' }, error: null });
    const result = await sendRegistrationConfirmationEmail('reg-1');
    expect(result.ok).toBe(false);
  });

  it('fails when the invoke itself errors', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('network') });
    expect((await sendRegistrationConfirmationEmail('reg-1')).ok).toBe(false);
  });
});
