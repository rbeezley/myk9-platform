import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DatabaseManager } from './DatabaseManager';
import { ReplicatedTableBatchManager } from './ReplicatedTableBatch';

let manager: DatabaseManager;
let batch: ReplicatedTableBatchManager<{ id: string }>;
beforeEach(async () => {
  manager = new DatabaseManager({}, `tombstone-versions-${crypto.randomUUID()}`, 5);
  const db = await manager.getDatabase('trials');
  batch = new ReplicatedTableBatchManager(
    'trials',
    { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    async () => db,
    vi.fn(),
    async () => 0
  );
});
afterEach(async () => {
  await manager.reset();
});

it('atomically keeps newer clean restores, deletes equal/older versions, and leaves unguarded callers unchanged', async () => {
  await batch.batchSet(
    [{ id: 'newer' }, { id: 'equal' }, { id: 'older' }, { id: 'legacy' }],
    new Map([
      ['newer', 3],
      ['equal', 2],
      ['older', 1],
      ['legacy', 9],
    ])
  );
  expect(
    await batch.deleteRowsIfClean(
      ['newer', 'equal', 'older'],
      new Map([
        ['newer', 2],
        ['equal', 2],
        ['older', 2],
      ])
    )
  ).toEqual({ deleted: ['equal', 'older'], kept: ['newer'] });
  expect(await batch.deleteRowsIfClean(['legacy'])).toEqual({ deleted: ['legacy'], kept: [] });
});
