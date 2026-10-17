import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@/test/utils/testUtils';
import {
  ReplicationSyncContext,
  type ReplicationSyncContextValue,
} from '@/context/ReplicationSyncContext';
import type { ScoringEntry } from './types';

/**
 * MYK9-1130, production walk 2026-10-14: on a device whose replicas were wiped,
 * a direct visit read the class from an empty, never-synced classes replica and
 * committed "Class not found". The class synced seconds later, but the page did
 * not listen to the classes replica, so it stayed on "Class not found" until
 * Try again. The replicas here are stand-ins whose rows, sync metadata and
 * change listeners the test controls.
 */
const replica = vi.hoisted(() => ({
  classPresent: false,
  classesSynced: false,
  classListeners: new Set<() => void>(),
  rows: [] as unknown[],
  entriesSynced: false,
  entryListeners: new Set<() => void>(),
  sync: vi.fn(),
  setClassesSyncStatus: null as ((status: 'syncing' | 'success') => void) | null,
}));

vi.mock('./useScoringBreadcrumb', () => ({
  useScoringBreadcrumb: () => ({ isLoading: true, showId: 'show-1' }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('./components/SessionToolbar', () => ({ SessionToolbar: () => null }));
vi.mock('./paperScoresheetData', () => ({
  loadEntriesWithDogs: vi.fn(async () => replica.rows),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    sync: replica.sync,
    getCurrentAuthUserId: async () => 'user-test',
    getSyncMetadata: vi.fn(async () =>
      replica.entriesSynced
        ? { totalRows: replica.rows.length, syncedByAuthUserId: 'user-test' }
        : null
    ),
    subscribe: vi.fn((listener: () => void) => {
      replica.entryListeners.add(listener);
      return () => replica.entryListeners.delete(listener);
    }),
    whenShowSyncSettles: vi.fn(() => null),
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn(async () =>
      replica.classPresent ? { id: 'class-1', name: 'Container Novice', trialId: 'trial-1' } : null
    ),
    // The app-wide classes sync runs with an empty scope; a completed sync
    // records that scope's row count.
    getSyncMetadataOrThrow: vi.fn(async (scope?: string) =>
      scope === '' && replica.classesSynced ? { totalRows: replica.classPresent ? 1 : 0 } : null
    ),
    subscribe: vi.fn((listener: () => void) => {
      replica.classListeners.add(listener);
      return () => replica.classListeners.delete(listener);
    }),
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getTrialById: vi.fn(async () => ({ id: 'trial-1', showId: 'show-1' })),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { get: vi.fn().mockResolvedValue(null) },
}));

import { PaperScoresheetPage } from './PaperScoresheetPage';

const dog = (entryId: string, callName: string, order: number, isScored = false): ScoringEntry =>
  ({
    entryId,
    classId: 'class-1',
    dogId: `dog-${entryId}`,
    callName,
    handler: 'Pat Handler',
    breed: 'Beagle',
    armband: 100 + order,
    status: isScored ? 'scored' : 'pending',
    inRing: false,
    isScored,
    exhibitorOrder: order,
  }) as ScoringEntry;

/** The app-wide sync provider, reduced to the classes table's status. */
function SyncProvider({ children }: { children: React.ReactNode }) {
  const [classes, setClasses] = useState<'syncing' | 'success'>('syncing');
  useEffect(() => {
    replica.setClassesSyncStatus = setClasses;
  }, []);
  const value: ReplicationSyncContextValue = {
    status: { isSyncing: true, lastSyncAt: null, error: null, tablesStatus: { classes } },
    triggerSync: async () => undefined,
    syncTable: async () => undefined,
  };
  return (
    <ReplicationSyncContext.Provider value={value}>{children}</ReplicationSyncContext.Provider>
  );
}

function renderPage() {
  return render(
    <SyncProvider>
      <Routes>
        <Route path="/scoring/classes/:classId/entries" element={<PaperScoresheetPage />} />
      </Routes>
    </SyncProvider>,
    { initialRoute: '/scoring/classes/class-1/entries?mode=split' }
  );
}

describe('PaperScoresheetPage — a class that reaches a cold classes replica after mount (MYK9-1130)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replica.classPresent = false;
    replica.classesSynced = false;
    replica.classListeners.clear();
    replica.rows = [];
    replica.entriesSynced = false;
    replica.entryListeners.clear();
    // The bounded show sync: writes the show's entries, then records the scope.
    replica.sync.mockImplementation(async () => {
      replica.rows = [dog('e1', 'Willow', 1, true), dog('e2', 'Cooper', 2)];
      replica.entriesSynced = true;
      return { success: true };
    });
    onlineManager.setOnline(true);
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('waits for a never-synced classes replica, then lists the dogs with no Try again', async () => {
    renderPage();

    expect(await screen.findByText(/not finished loading on this device/)).toBeInTheDocument();
    expect(screen.queryByText('Class not found')).not.toBeInTheDocument();

    // The app-wide classes sync lands the class, then records the scope.
    replica.classPresent = true;
    await act(async () => {
      for (const listener of [...replica.classListeners]) listener();
    });
    replica.classesSynced = true;

    expect(await screen.findByText('1 of 2 scored')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cooper/ })).toBeInTheDocument();
    expect(screen.queryByText('Class not found')).not.toBeInTheDocument();
    expect(screen.queryByText(/not finished loading/)).not.toBeInTheDocument();
    // The arrival got the cold show its one bounded entries sync.
    await waitFor(() => expect(replica.sync).toHaveBeenCalledTimes(1));
    expect(replica.sync).toHaveBeenCalledWith('show-1');
  });

  it('a later classes change turns "not finished loading" into "Class not found"', async () => {
    renderPage();
    expect(await screen.findByText(/not finished loading on this device/)).toBeInTheDocument();

    // The classes sync completed without the class; something else then changed.
    replica.classesSynced = true;
    await act(async () => {
      for (const listener of [...replica.classListeners]) listener();
    });

    expect(await screen.findByText('Class not found')).toBeInTheDocument();
    expect(screen.queryByText(/not finished loading/)).not.toBeInTheDocument();
  });

  it('says "Class not found" once the classes sync completes without it, with no Try again', async () => {
    renderPage();
    expect(await screen.findByText(/not finished loading on this device/)).toBeInTheDocument();

    // Recording the completed sync notifies no replica listener; the provider
    // reports the classes table settled.
    replica.classesSynced = true;
    await act(async () => replica.setClassesSyncStatus?.('success'));

    expect(await screen.findByText('Class not found')).toBeInTheDocument();
    expect(screen.queryByText(/not finished loading/)).not.toBeInTheDocument();
  });

  it('still says "Class not found" when the classes replica has synced without the class', async () => {
    replica.classesSynced = true;
    renderPage();

    expect(await screen.findByText('Class not found')).toBeInTheDocument();
    expect(screen.queryByText(/not finished loading/)).not.toBeInTheDocument();
  });
});
