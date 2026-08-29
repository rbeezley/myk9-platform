/**
 * This chip previously rendered the literal string "Offline ready" with no
 * inputs — no props, no state, no condition — mounted unconditionally in the
 * entry-list header. A judge deciding whether it was safe to walk into a
 * dead-zone ring was reading a hard-coded constant.
 *
 * The CAPABILITY framing is deliberate (#739, "Clarify persistent offline
 * capability copy as Offline ready") and is preserved — the chip must never read
 * as a statement about current connectivity, which
 * `atShowLayoutSlotComponents.test.tsx` pins separately. What these add is the
 * timing: the promise is only honest once the data is actually local.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { CompactOfflineIndicator } from '../atShowLayoutSlotComponents';

type SyncStatus = ReplicationSyncContextValue['status'];

function renderChip(status: SyncStatus | null) {
  const value = status === null ? null : ({ status } as unknown as ReplicationSyncContextValue);

  return render(
    <ReplicationSyncContext.Provider value={value}>
      <CompactOfflineIndicator />
    </ReplicationSyncContext.Provider>
  );
}

function syncStatus(isSyncing: boolean, tablesStatus: Record<string, string>): SyncStatus {
  return { isSyncing, tablesStatus } as unknown as SyncStatus;
}

describe('CompactOfflineIndicator', () => {
  it('does NOT promise offline readiness before the first sync completes', () => {
    // The case the constant got wrong: a cold first load, nothing cached yet.
    renderChip(syncStatus(true, {}));

    expect(screen.queryByText(/offline ready/i)).not.toBeInTheDocument();
    expect(screen.getByText(/preparing offline copy/i)).toBeInTheDocument();
  });

  it('does not promise readiness while a required table has not synced', () => {
    // 'idle' and 'syncing' are the real pending statuses
    // (replicationSyncEmptyState.PENDING_TABLE_STATUSES). Entries has never
    // synced here, so an offline promise would be unfounded even though the
    // other three tables are ready.
    renderChip(
      syncStatus(false, {
        shows: 'synced',
        trials: 'synced',
        classes: 'synced',
        entries: 'idle',
      })
    );

    expect(screen.queryByText(/offline ready/i)).not.toBeInTheDocument();
  });

  it('promises offline readiness only once every required table has synced', () => {
    renderChip(
      syncStatus(false, {
        shows: 'synced',
        trials: 'synced',
        classes: 'synced',
        entries: 'synced',
      })
    );

    expect(screen.getByText('Offline ready')).toBeInTheDocument();
  });

  it('declines to promise when there is no replication context at all', () => {
    // A header chip must not be able to crash a judge's ring list, and an
    // absent provider is one more way of not knowing whether the data is local.
    renderChip(null);

    expect(screen.queryByText(/offline ready/i)).not.toBeInTheDocument();
    expect(screen.getByText(/preparing offline copy/i)).toBeInTheDocument();
  });
});
