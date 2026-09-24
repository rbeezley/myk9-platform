import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { functions: { invoke } },
}));
vi.mock('@/services/LoggingService', () => ({ logger: { error: logError } }));

import { notifyAccessRequestEmail } from '../accessRequestEmail';

describe('notifyAccessRequestEmail', () => {
  beforeEach(() => {
    invoke.mockReset();
    logError.mockReset();
  });

  it('asks the edge function for the request kind and id only', async () => {
    invoke.mockResolvedValue({ data: { sent: 1 }, error: null });

    await notifyAccessRequestEmail('membership', 'request-1', 'decision');

    expect(invoke).toHaveBeenCalledWith('send-access-request-email', {
      body: { kind: 'membership', requestId: 'request-1', event: 'decision' },
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('does nothing without a request id (a duplicate the server absorbed)', async () => {
    await notifyAccessRequestEmail('new_club', null, 'submitted');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('logs and resolves when the function answers with an error', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Email service not configured') });

    await expect(
      notifyAccessRequestEmail('secretary', 'request-2', 'submitted')
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      'Access request email could not be sent',
      'access-requests',
      expect.objectContaining({ kind: 'secretary', requestId: 'request-2' })
    );
  });

  it('logs and resolves when the call itself throws', async () => {
    invoke.mockRejectedValue(new Error('offline'));

    await expect(
      notifyAccessRequestEmail('new_club', 'request-3', 'submitted')
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
