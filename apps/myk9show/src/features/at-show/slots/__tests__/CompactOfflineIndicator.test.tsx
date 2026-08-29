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

function syncStatus(
  isSyncing: boolean,
  tablesStatus: Record<string, string>,
  lastSyncAt: Date | null = new Date()
): SyncStatus {
  return { isSyncing, tablesStatus, lastSyncAt } as unknown as SyncStatus;
}

describe('CompactOfflineIndicator', () => {
  it('does NOT promise offline readiness before the first sync completes', () => {
    // The case the constant got wrong: a cold first load, nothing cached yet.
    renderChip(syncStatus(true, {}, null));

    expect(screen.queryByText(/offline ready/i)).not.toBeInTheDocument();
    expect(screen.getByText(/preparing offline copy/i)).toBeInTheDocument();
  });

  it('does not promise readiness before a full sync has ever completed', () => {
    // 'idle' and 'syncing' are the real pending statuses
    // (replicationSyncEmptyState.PENDING_TABLE_STATUSES). Entries has never
    // synced here, so an offline promise would be unfounded even though the
    // other three tables are ready.
    renderChip(
      syncStatus(false, {
        shows: 'success',
        trials: 'success',
        classes: 'success',
        entries: 'idle',
      },
        null
      )
    );

    expect(screen.queryByText(/offline ready/i)).not.toBeInTheDocument();
  });

  it('promises offline readiness only once every required table has synced', () => {
    renderChip(
      syncStatus(false, {
        shows: 'success',
        trials: 'success',
        classes: 'success',
        entries: 'success',
      })
    );

    expect(screen.getByText('Offline ready')).toBeInTheDocument();
  });

  it("keeps the promise during the provider's periodic re-sync", () => {
    // The provider re-syncs every 60s. Keying the chip on `isSyncing` made it
    // retract "Offline ready" once a minute for the whole show, and strand on
    // "Preparing..." after an aborted sync — while the data was already local.
    renderChip(
      syncStatus(true, {
        shows: 'syncing',
        trials: 'success',
        classes: 'success',
        entries: 'success',
      })
    );

    expect(screen.getByText('Offline ready')).not.toBeNull();
  });

  it('withdraws the promise when a required table actually errored', () => {
    renderChip(
      syncStatus(false, {
        shows: 'success',
        trials: 'success',
        classes: 'success',
        entries: 'error',
      })
    );

    expect(screen.queryByText(/offline ready/i)).toBeNull();
  });

  it('declines to promise when there is no replication context at all', () => {
    // A header chip must not be able to crash a judge's ring list, and an
    // absent provider is one more way of not knowing whether the data is local.
    renderChip(null);

    expect(screen.queryByText(/offline ready/i)).not.toBeInTheDocument();
    expect(screen.getByText(/preparing offline copy/i)).toBeInTheDocument();
  });
});
