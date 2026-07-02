import { describe, expect, it } from 'vitest';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { areReplicationTablesPendingFirstSync } from './replicationSyncEmptyState';

function makeStatus(
  overrides: Partial<ReplicationSyncContextValue['status']>
): ReplicationSyncContextValue['status'] {
  return {
    isSyncing: false,
    lastSyncAt: null,
    error: null,
    tablesStatus: {},
    ...overrides,
  };
}

describe('areReplicationTablesPendingFirstSync', () => {
  it('treats global sync as pending', () => {
    expect(areReplicationTablesPendingFirstSync(makeStatus({ isSyncing: true }), ['entries'])).toBe(
      true
    );
  });

  it('treats idle or syncing tracked tables as pending', () => {
    expect(
      areReplicationTablesPendingFirstSync(
        makeStatus({ tablesStatus: { entries: 'idle', classes: 'success' } }),
        ['entries', 'classes']
      )
    ).toBe(true);
    expect(
      areReplicationTablesPendingFirstSync(
        makeStatus({ tablesStatus: { entries: 'syncing', classes: 'success' } }),
        ['entries', 'classes']
      )
    ).toBe(true);
  });

  it('does not block once tracked tables settled', () => {
    expect(
      areReplicationTablesPendingFirstSync(
        makeStatus({ tablesStatus: { entries: 'success', classes: 'error' } }),
        ['entries', 'classes']
      )
    ).toBe(false);
  });
});
