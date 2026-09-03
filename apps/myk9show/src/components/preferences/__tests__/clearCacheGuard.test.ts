import { describe, expect, it } from 'vitest';
import { decideClearCache } from '../clearCacheGuard';

describe('decideClearCache', () => {
  it('blocks when replication mutations are pending', () => {
    expect(decideClearCache({ pendingMutationCount: 2, offlineSyncQueueCount: 0 })).toEqual({
      allowed: false,
      pendingCount: 2,
    });
  });

  it('blocks when offline scoring work is pending', () => {
    expect(decideClearCache({ pendingMutationCount: 0, offlineSyncQueueCount: 3 })).toEqual({
      allowed: false,
      pendingCount: 3,
    });
  });

  it('allows clearing when both queues are empty', () => {
    expect(decideClearCache({ pendingMutationCount: 0, offlineSyncQueueCount: 0 })).toEqual({
      allowed: true,
      pendingCount: 0,
    });
  });
});
