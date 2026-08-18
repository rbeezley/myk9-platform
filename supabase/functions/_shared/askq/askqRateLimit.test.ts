import { describe, expect, it, vi } from 'vitest';

import { reserveAskQQuery } from './askqRateLimit.ts';

function makeClient(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  };
}

describe('AskQ atomic quota reservation', () => {
  it('returns the reserved audit row and account-specific quota', async () => {
    const client = makeClient([
      {
        allowed: true,
        log_id: 'log-1',
        remaining: 9,
        daily_limit: 10,
        resets_at: '2026-08-02T00:00:00.000Z',
      },
    ]);

    await expect(reserveAskQQuery(client, 'How do I enter?')).resolves.toEqual({
      status: 'allowed',
      logId: 'log-1',
      remaining: 9,
      limit: 10,
      resetsAt: '2026-08-02T00:00:00.000Z',
    });
    expect(client.rpc).toHaveBeenCalledWith('reserve_askq_query', { p_query: 'How do I enter?' });
  });

  it('returns a rate-limited result without an audit row', async () => {
    const client = makeClient([
      {
        allowed: false,
        log_id: null,
        remaining: 0,
        daily_limit: 50,
        resets_at: '2026-08-02T00:00:00.000Z',
      },
    ]);

    await expect(reserveAskQQuery(client, 'How do I enter?')).resolves.toEqual({
      status: 'limited',
      remaining: 0,
      limit: 50,
      resetsAt: '2026-08-02T00:00:00.000Z',
    });
  });

  it.each([
    ['RPC error', null, { message: 'database unavailable' }],
    ['missing result', [], null],
    ['null result', null, null],
    [
      'missing reservation fields',
      [{ allowed: true, log_id: 'log-1', daily_limit: null, remaining: null, resets_at: null }],
      null,
    ],
    [
      'zero or non-integer limit',
      [{ allowed: true, log_id: 'log-1', daily_limit: 0, remaining: 0, resets_at: 'reset' }],
      null,
    ],
  ])('fails closed for %s', async (_label, data, error) => {
    await expect(reserveAskQQuery(makeClient(data, error), 'How do I enter?')).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
