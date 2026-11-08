/**
 * MYK9-1757 (Codex round 1): a local write that changes check_in_status makes the replica's copy
 * of the server's pull stamp stale. Exhibitor flags, staff Clear and re-flag while OFFLINE: the
 * desk must say "Flagged as pulled." (unknown) until the next sync, never credit the exhibitor.
 * Each of the three replicated check-in writers is driven through the real table.
 */
import { screen, within } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  databaseManager,
  detectDirtyRowConflict,
  MutationManager,
  REPLICATION_STORES,
} from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  ReplicatedEntriesTable,
  type ReplicatedEntry,
} from '@/services/replication/ReplicatedEntriesTable';
import { rowToEntry, type EntryRow } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { ENTRY_DIRTY_ROW_COMPARE_POLICY } from '@/services/replication/entriesDirtyRowComparePolicy';
import { CheckInDesk } from './CheckInDesk';
import { projectReplicatedToDeskEntry } from './pullSourceTestUtils';

vi.mock('@myk9/core', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/core')>()),
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/database/entries/flaggedPull', () => ({ clearFlaggedPull: vi.fn() }));
vi.mock('@/features/show-map/showMapActionMutations', () => ({
  scratchShowMapEntry: vi.fn(),
  undoShowMapScratch: vi.fn(),
}));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));
vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => ({
    readPending: false,
    readFailed: false,
    retry: vi.fn(),
    trials: [
      {
        id: 'trial-1',
        showId: 'show-1',
        name: 'Trial 1',
        trialNumber: '1',
        trialDate: '2026-07-08',
        timezone: 'America/New_York',
      },
    ],
    trialClasses: {
      'trial-1': [
        { id: 'class-1', element: 'Container', level: 'Novice', section: 'A', startTime: '09:00' },
      ],
    },
  }),
}));

const ID = 'entry-1';
const AUTH = 'secretary-user';
const NOW = new Date('2026-07-08T16:00:00.000Z');

/** What the sync delivered: pulled, stamped by the exhibitor. */
const seed = {
  id: ID,
  showId: 'show-1',
  classId: 'class-1',
  dogId: 'dog-1',
  handlerId: 'person-1',
  armband: '114',
  entryStatus: 'confirmed',
  checkInStatus: 'pulled',
  check_in_status: 'pulled',
  checkInPulledBy: 'exhibitor',
  check_in_pulled_by: 'exhibitor',
} as ReplicatedEntry;

describe('offline clear then re-flag never credits the earlier flagger', () => {
  let table: ReplicatedEntriesTable;
  let manager: MutationManager;

  beforeEach(async () => {
    await databaseManager.reset();
    const offline = () => new TypeError('Failed to fetch');
    const client = {
      rpc: vi.fn(async () => {
        throw offline();
      }),
      from: vi.fn(() => {
        throw offline();
      }),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: client }),
    });
    table = new ReplicatedEntriesTable();
    table.setMutationManager(manager);
    await table.clearCache();
    await table.batchSet([seed], new Map([[ID, 1]]));
  });

  afterEach(async () => {
    manager.destroy();
    await databaseManager.reset();
  });

  async function expectUnknownSourceOnDesk() {
    const row = await table.get(ID);
    expect(row?.checkInStatus).toBe('pulled');
    render(
      <CheckInDesk
        showId="show-1"
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        currentDate={NOW}
        entries={[projectReplicatedToDeskEntry(row as ReplicatedEntry)]}
      />
    );
    const card = screen.getByRole('article', { name: 'Poppy' });
    expect(within(card).getByText(/^Flagged as pulled\./)).toBeVisible();
    expect(screen.queryByText(/exhibitor flagged/)).not.toBeInTheDocument();
  }

  async function expectNoSourceInQueuedMutations() {
    const db = await databaseManager.getDatabase('test');
    const queued = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    expect(queued.length).toBeGreaterThan(0);
    expect(JSON.stringify(queued)).not.toMatch(/check_in_pulled_by|checkInPulledBy/);
  }

  it('positive control: the seeded row credits the exhibitor', () => {
    render(
      <CheckInDesk
        showId="show-1"
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        currentDate={NOW}
        entries={[projectReplicatedToDeskEntry(seed)]}
      />
    );
    expect(screen.getByText(/^The exhibitor flagged this pull\./)).toBeVisible();
  });

  it('updateCheckInStatus', async () => {
    await table.updateCheckInStatus(ID, 'checked-in');
    await table.updateCheckInStatus(ID, 'pulled');
    await expectUnknownSourceOnDesk();
    await expectNoSourceInQueuedMutations();
  });

  it('updateEntry / updateEntryWith (applyEntryUpdate)', async () => {
    await table.updateEntry(ID, { checkInStatus: 'checked-in' });
    await table.updateEntryWith(ID, () => ({ checkInStatus: 'pulled' }));
    await expectUnknownSourceOnDesk();
    await expectNoSourceInQueuedMutations();
  });

  it('updateSecretaryLifecycleStatus', async () => {
    await table.updateSecretaryLifecycleStatus(ID, {
      entryStatus: 'confirmed',
      checkInStatus: 'checked-in',
    });
    await table.updateSecretaryLifecycleStatus(ID, {
      entryStatus: 'confirmed',
      checkInStatus: 'pulled',
    });
    await expectUnknownSourceOnDesk();
    await expectNoSourceInQueuedMutations();
  });

  it('local writes never touch the server-owned stamp; the dirty row just stops showing it', async () => {
    await table.updateCheckInStatus(ID, 'checked-in');
    await table.updateCheckInStatus(ID, 'pulled');
    const row = await table.get(ID);
    expect(row?.checkInPulledBy).toBe('exhibitor');
    expect(row?._syncStatus).toBe('pending');
  });
});

/** A server row of the replication view, mapped the way the sync maps it. */
function serverRow(status: string, source?: string | null): ReplicatedEntry {
  return rowToEntry({
    id: ID,
    show_id: 'show-1',
    class_id: 'class-1',
    dog_id: 'dog-1',
    handler_id: 'person-1',
    entry_status: 'confirmed',
    check_in_status: status,
    ...(source === undefined ? {} : { check_in_pulled_by: source }),
  } as unknown as EntryRow);
}

describe('reconnect: the pull source is server-owned in dirty-row reconciliation', () => {
  // The device changed Pulled -> Checked-in; so did another device, which also re-stamped the source.
  const base = serverRow('pulled', 'exhibitor');
  const remote = serverRow('checked-in', null);

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a stale staff stamp', 'staff'],
  ])('a local copy holding %s against the server is no conflict', (_label, localSource) => {
    const local = {
      ...base,
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
      checkInPulledBy: localSource,
      check_in_pulled_by: localSource,
      _syncStatus: 'pending',
    } as ReplicatedEntry;

    const detection = detectDirtyRowConflict({
      base,
      local,
      remote,
      comparePolicy: ENTRY_DIRTY_ROW_COMPARE_POLICY,
    });

    expect(detection.hasConflict).toBe(false);
    expect(detection.fields).toEqual([]);
  });

  it('ends with the server source, and the desk then shows the server wording', () => {
    const serverFlag = serverRow('pulled', 'staff');
    // Offline: cleared then re-flagged here, so the copy is stale and the row is dirty.
    const local = {
      ...base,
      checkInPulledBy: 'exhibitor',
      check_in_pulled_by: 'exhibitor',
      _syncStatus: 'pending',
    } as ReplicatedEntry;
    const detection = detectDirtyRowConflict({
      base,
      local,
      remote: serverFlag,
      comparePolicy: ENTRY_DIRTY_ROW_COMPARE_POLICY,
    });
    expect(detection.hasConflict).toBe(false);
    expect(detection.adoptRemoteFields).toEqual(
      expect.arrayContaining(['checkInPulledBy', 'check_in_pulled_by'])
    );

    // What reconcileDirtyRow does with adoptRemoteFields, then the upload acknowledged (clean).
    const reconciled = { ...local, _syncStatus: 'synced' } as Record<string, unknown>;
    for (const field of detection.adoptRemoteFields ?? []) {
      reconciled[field] = (serverFlag as unknown as Record<string, unknown>)[field];
    }
    expect(reconciled.check_in_pulled_by).toBe('staff');

    render(
      <CheckInDesk
        showId="show-1"
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        currentDate={NOW}
        entries={[projectReplicatedToDeskEntry(reconciled as unknown as ReplicatedEntry)]}
      />
    );
    expect(screen.getByText(/^Ringside staff flagged this pull\./)).toBeVisible();
  });
});
