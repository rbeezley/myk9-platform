import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
afterEach(async () => {
  vi.restoreAllMocks();
  await resetReplica();
});

describe('ringside class load when the moved-destination lookup fails (MYK9-1940)', () => {
  it('keeps the entries and falls back to the plain Moved label', async () => {
    await replicatedClassesTable.batchSet([{ id: 'class-a' }] as never);
    await replicatedEntriesTable.batchSet([
      { id: 'moved-1', classId: 'class-a', dogId: 'dog-one', entryStatus: 'moved' },
      { id: 'other', classId: 'class-a', dogId: 'dog-two' },
    ] as never);
    vi.spyOn(replicatedEntriesTable, 'getEntriesByShow').mockRejectedValue(
      new Error('show-wide read failed')
    );

    const data = await createAtShowDataDependencies().fetchSingleClass(
      'class-a',
      'show-one',
      'judge'
    );

    expect(data.entries.map(entry => entry.id).sort()).toEqual(['moved-1', 'other']);
    const moved = data.entries.find(entry => entry.id === 'moved-1');
    expect(moved?.movedToClassName).toBeUndefined();
  });
});
