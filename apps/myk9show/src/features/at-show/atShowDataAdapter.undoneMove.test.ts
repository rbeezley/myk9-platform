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

// MYK9-2477: a dog moved A -> B, the move undone, then moved again. The undo soft-deletes the
// first B entry, and a device can still hold that row. It is not a dog that is "not running":
// listed, it read as the live entry shown twice.
async function seedMovedTwice() {
  await replicatedClassesTable.batchSet([
    { id: 'class-a', element: 'Container', level: 'Novice', section: 'A' },
    { id: 'class-b', element: 'Container', level: 'Novice', section: 'B' },
  ] as never);
  await replicatedEntriesTable.batchSet([
    { id: 'old-a', classId: 'class-a', showId: 'show-one', dogId: 'cooper', entryStatus: 'moved' },
    {
      id: 'undone-b',
      classId: 'class-b',
      showId: 'show-one',
      dogId: 'cooper',
      entryStatus: 'confirmed',
      movedFromEntryId: 'old-a',
      deletedAt: '2026-11-26T22:39:15.916Z',
    },
    {
      id: 'live-b',
      classId: 'class-b',
      showId: 'show-one',
      dogId: 'cooper',
      entryStatus: 'confirmed',
      movedFromEntryId: 'old-a',
    },
  ] as never);
}

describe('ringside class load after a move was undone and made again (MYK9-2477)', () => {
  it('combined A & B: the new entry is listed once, pending, and only the old one is not running', async () => {
    await seedMovedTwice();

    const data = await createAtShowDataDependencies().fetchCombinedClasses(
      'class-a',
      'class-b',
      'show-one',
      'judge'
    );

    expect(data.entries.map(entry => entry.id).sort()).toEqual(['live-b', 'old-a']);
    expect(data.classInfo?.entryClassification).toEqual({
      'old-a': 'not_running',
      'live-b': 'pending',
    });
    const old = data.entries.find(entry => entry.id === 'old-a');
    expect(old?.movedToClassName).toBe('Container Novice B');
  });

  it('Section B alone leaves the undone entry out too', async () => {
    await seedMovedTwice();

    const data = await createAtShowDataDependencies().fetchSingleClass(
      'class-b',
      'show-one',
      'judge'
    );

    expect(data.entries.map(entry => entry.id)).toEqual(['live-b']);
  });
});
