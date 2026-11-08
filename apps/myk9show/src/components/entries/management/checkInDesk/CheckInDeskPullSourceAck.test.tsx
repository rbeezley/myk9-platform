/**
 * MYK9-1766: the upload acknowledgement marks the local row `synced` without refreshing the
 * server-owned `check_in_pulled_by`. After staff Clear and re-flag a pull, uploaded but not yet
 * downloaded, the desk must say the generic "Flagged as pulled", never credit the earlier flagger.
 * Driven through the real table and the real MutationManager upload acknowledgement.
 */
import { screen, within } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, MutationManager, REPLICATION_STORES } from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  ReplicatedEntriesTable,
  type ReplicatedEntry,
} from '@/services/replication/ReplicatedEntriesTable';
import { rowToEntry, type EntryRow } from '@/services/replication/ReplicatedEntriesTable.mapper';
import {
  toSecretaryEntry,
  type SecretaryEntryRelations,
} from '@/services/database/entries/secretaryReadReplication';
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

const NO_RELATIONS: SecretaryEntryRelations = {
  dogsMap: new Map(),
  classesMap: new Map(),
  armbandsByEntryId: new Map(),
  armbandsByDogId: new Map(),
  peopleMap: new Map(),
  enrollmentsMap: new Map(),
  trialsMap: new Map(),
  pullMetadataMap: new Map(),
};
const secretarySource = (entry: ReplicatedEntry) => ({
  check_in_pulled_by: toSecretaryEntry(entry, NO_RELATIONS).check_in_pulled_by,
});
const AUTH = 'secretary-user';
const NOW = new Date('2026-07-08T16:00:00.000Z');

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

/** A server row of the replication view, mapped the way the sync maps it. */
function serverRow(source: string): ReplicatedEntry {
  return rowToEntry({
    id: ID,
    show_id: 'show-1',
    class_id: 'class-1',
    dog_id: 'dog-1',
    handler_id: 'person-1',
    entry_status: 'confirmed',
    check_in_status: 'pulled',
    check_in_pulled_by: source,
  } as unknown as EntryRow);
}

describe('upload acknowledgement does not resurrect the earlier flagger', () => {
  let table: ReplicatedEntriesTable;
  let manager: MutationManager;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await databaseManager.reset();
    rpc = vi.fn(async () => ({ data: 2, error: null, status: 200 }));
    const client = { rpc, from: vi.fn() } as unknown as SupabaseClient;
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

  it('clear, re-flag, upload acknowledged: generic wording; the download then restores the source', async () => {
    await table.updateCheckInStatus(ID, 'checked-in');
    await table.updateCheckInStatus(ID, 'pulled');

    await manager.uploadPendingMutations();
    expect(await manager.getPendingCount()).toBe(0);
    expect(rpc).toHaveBeenCalled();

    const acked = (await table.get(ID)) as ReplicatedEntry;
    expect(acked._syncStatus).toBe('synced');
    expect(acked.checkInStatus).toBe('pulled');
    expect(secretarySource(acked).check_in_pulled_by).toBeNull();

    render(
      <CheckInDesk
        showId="show-1"
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        currentDate={NOW}
        entries={[projectReplicatedToDeskEntry(acked)]}
      />
    );
    const card = screen.getByRole('article', { name: 'Poppy' });
    expect(within(card).getByText(/^Flagged as pulled\./)).toBeVisible();
    expect(screen.queryByText(/exhibitor flagged/)).not.toBeInTheDocument();

    // The server-owned stamp never travels up.
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/check_in_pulled_by|checkInPulledBy/);
    const db = await databaseManager.getDatabase('test');
    const queued = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    expect(JSON.stringify(queued)).not.toMatch(/check_in_pulled_by|checkInPulledBy/);

    // The next download carries the real stamp and lands.
    await table.batchSet([serverRow('staff')], new Map([[ID, 3]]));
    const downloaded = (await table.get(ID)) as ReplicatedEntry;
    expect(downloaded.check_in_pulled_by).toBe('staff');
    expect(secretarySource(downloaded).check_in_pulled_by).toBe('staff');
  });
});
