import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseManager } from '@myk9/replication';
import {
  replicatedArmbandsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { createAtShowDataDependencies } from './atShowDataAdapter';

async function resetReplica() {
  await databaseManager.reset();
  await Promise.all([
    replicatedArmbandsTable.clearCache(),
    replicatedClassesTable.clearCache(),
    replicatedEntriesTable.clearCache(),
    replicatedTrialsTable.clearCache(),
  ]);
}

beforeEach(resetReplica);
afterEach(resetReplica);

describe('ringside cached armband resolution', () => {
  it('uses entry, assigned-entry, then assigned-dog priority and keeps other shows out', async () => {
    await replicatedClassesTable.batchSet([{ id: 'class-a' }, { id: 'class-b' }] as never);
    await replicatedEntriesTable.batchSet([
      { id: 'explicit', classId: 'class-a', dogId: 'dog-one', armband: '11' },
      { id: 'by-entry', classId: 'class-a', dogId: 'dog-one', armband: null },
      { id: 'by-dog', classId: 'class-b', dogId: 'dog-one', armband: null },
      { id: 'other-show', classId: 'class-b', dogId: 'dog-two', armband: null },
      { id: 'available', classId: 'class-b', dogId: 'dog-three', armband: null },
    ] as never);
    await replicatedArmbandsTable.batchSet([
      {
        id: 'assigned-entry',
        showId: 'show-one',
        entryId: 'by-entry',
        armbandNumber: '22',
        isAvailable: false,
      },
      {
        id: 'assigned-dog',
        showId: 'show-one',
        dogId: 'dog-one',
        armbandNumber: '33',
        isAvailable: false,
      },
      {
        id: 'wrong-show',
        showId: 'show-two',
        dogId: 'dog-two',
        armbandNumber: '44',
        isAvailable: false,
      },
      {
        id: 'unassigned',
        showId: 'show-one',
        dogId: 'dog-three',
        armbandNumber: '55',
        isAvailable: true,
      },
    ]);
    // These reads use real IndexedDB tables only; no sync/network is requested.
    const data = await createAtShowDataDependencies().fetchCombinedClasses!(
      'class-a',
      'class-b',
      'show-one',
      'judge'
    );
    expect(Object.fromEntries(data.entries.map(entry => [entry.id, entry.armband]))).toEqual({
      explicit: 11,
      'by-entry': 22,
      'by-dog': 33,
      'other-show': null,
      available: null,
    });
  });
});
