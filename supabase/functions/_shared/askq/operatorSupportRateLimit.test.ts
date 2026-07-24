import { describe, expect, it, vi } from 'vitest';

import {
  createOperatorSupportRateLimiter,
  OPERATOR_SUPPORT_DAILY_LIMIT,
} from './operatorSupportRateLimit.ts';

function makeClient(count: number | null, error: { message: string } | null = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(async () => ({ count, error })),
  };

  return {
    client: { from: vi.fn(() => query) },
    query,
  };
}

describe('Operator Support rate limit', () => {
  it('counts only this user and the operator-support source for the UTC day', async () => {
    const { client, query } = makeClient(4);
    const check = createOperatorSupportRateLimiter(
      client,
      () => new Date('2026-07-24T18:30:00.000Z')
    );

    await expect(check('admin-1')).resolves.toEqual({
      status: 'allowed',
      remaining: 15,
      limit: OPERATOR_SUPPORT_DAILY_LIMIT,
      resetsAt: '2026-07-25T00:00:00.000Z',
    });

    expect(client.from).toHaveBeenCalledWith('chatbot_query_log');
    expect(query.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(query.eq).toHaveBeenNthCalledWith(1, 'user_id', 'admin-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'app_source', 'operator-support');
    expect(query.gte).toHaveBeenCalledWith('created_at', '2026-07-24T00:00:00.000Z');
  });

  it('fails closed when the rate-limit query is unavailable', async () => {
    const { client } = makeClient(null, { message: 'database unavailable' });
    const check = createOperatorSupportRateLimiter(client);

    await expect(check('admin-1')).resolves.toEqual({ status: 'unavailable' });
  });

  it('rejects requests at the daily limit', async () => {
    const { client } = makeClient(OPERATOR_SUPPORT_DAILY_LIMIT);
    const check = createOperatorSupportRateLimiter(
      client,
      () => new Date('2026-07-24T18:30:00.000Z')
    );

    await expect(check('admin-1')).resolves.toEqual({
      status: 'limited',
      remaining: 0,
      limit: OPERATOR_SUPPORT_DAILY_LIMIT,
      resetsAt: '2026-07-25T00:00:00.000Z',
    });
  });
});
