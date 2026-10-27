import { describe, expect, it } from 'vitest';
import { rebaseQueuedMutation } from './mutation-queue-rewrite';
import type { PendingMutation } from './types';

const queued = (data: Record<string, unknown>): PendingMutation =>
  ({
    id: 'm1',
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'e1',
    data,
    explicitDataKeys: Object.keys(data),
    serverVersion: 1,
  }) as unknown as PendingMutation;

describe('rebaseQueuedMutation (MYK9-1442)', () => {
  it('refreshes only the columns the mutation queued, not the whole rebuilt row', () => {
    const rebased = rebaseQueuedMutation(
      queued({ id: 'e1', special_requests: 'old' }),
      4,
      { id: 'e1', special_requests: 'merged', check_in_status: 'no-status', armband: '7' },
      []
    );

    expect(rebased?.serverVersion).toBe(4);
    expect(rebased?.data).toEqual({ id: 'e1', special_requests: 'merged' });
  });

  it('keeps a queued column the rebuild omits', () => {
    const rebased = rebaseQueuedMutation(
      queued({ id: 'e1', special_requests: 'old' }),
      4,
      { id: 'e1' },
      []
    );

    expect(rebased?.data).toEqual({ id: 'e1', special_requests: 'old' });
  });
});
