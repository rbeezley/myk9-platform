import { describe, expect, it, vi } from 'vitest';

import {
  reserveOperatorSupportQuery,
  OPERATOR_SUPPORT_DAILY_LIMIT,
} from './operatorSupportRateLimit.ts';

function makeClient(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  };
}

describe('Operator Support atomic quota reservation', () => {
  it('returns the reserved redacted audit row and remaining quota', async () => {
    const client = makeClient([
      {
        allowed: true,
        log_id: 'log-1',
        remaining: 15,
        daily_limit: OPERATOR_SUPPORT_DAILY_LIMIT,
        resets_at: '2026-07-25T00:00:00.000Z',
      },
    ]);

    await expect(reserveOperatorSupportQuery(client)).resolves.toEqual({
      status: 'allowed',
      logId: 'log-1',
      remaining: 15,
      limit: OPERATOR_SUPPORT_DAILY_LIMIT,
      resetsAt: '2026-07-25T00:00:00.000Z',
    });
    expect(client.rpc).toHaveBeenCalledWith('reserve_operator_support_query');
  });

  it('returns a rate-limited result without an audit row', async () => {
    const client = makeClient([
      {
        allowed: false,
        log_id: null,
        remaining: 0,
        daily_limit: OPERATOR_SUPPORT_DAILY_LIMIT,
        resets_at: '2026-07-25T00:00:00.000Z',
      },
    ]);

    await expect(reserveOperatorSupportQuery(client)).resolves.toEqual({
      status: 'limited',
      remaining: 0,
      limit: OPERATOR_SUPPORT_DAILY_LIMIT,
      resetsAt: '2026-07-25T00:00:00.000Z',
    });
  });

  it.each([
    ['RPC error', null, { message: 'database unavailable' }],
    ['missing result', [], null],
    ['null result', null, null],
    [
      'missing count fields',
      [{ allowed: true, log_id: 'log-1', daily_limit: null, remaining: null, resets_at: null }],
      null,
    ],
  ])('fails closed for %s', async (_label, data, error) => {
    await expect(reserveOperatorSupportQuery(makeClient(data, error))).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
