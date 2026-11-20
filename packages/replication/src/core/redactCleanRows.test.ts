import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DatabaseManager, REPLICATION_STORES } from './DatabaseManager';
import { ReplicatedTableBatchManager } from './ReplicatedTableBatch';

type Person = { id: string; firstName: string; phone: string | null; _localOnly?: boolean };

let manager: DatabaseManager;
let batch: ReplicatedTableBatchManager<Person>;
let db: Awaited<ReturnType<DatabaseManager['getDatabase']>>;
const redact = (p: Person): Person => ({ ...p, phone: null });

beforeEach(async () => {
  manager = new DatabaseManager({}, `redact-clean-${crypto.randomUUID()}`, 5);
  db = await manager.getDatabase('people');
  batch = new ReplicatedTableBatchManager(
    'people',
    { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    async () => db,
    vi.fn(),
    async () => 0
  );
});
afterEach(async () => {
  await manager.reset();
});

async function dataOf(id: string): Promise<Person> {
  const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, ['people', id])) as {
    data: Person;
  };
  return row.data;
}

it('rewrites clean rows and leaves local-only, dirty and queued rows whole', async () => {
  await batch.batchSet([
    { id: 'sent', firstName: 'Sent', phone: '555-0001' },
    { id: 'localOnly', firstName: 'Local', phone: '555-0002', _localOnly: true },
    { id: 'queued', firstName: 'Queued', phone: '555-0003' },
    { id: 'dirty', firstName: 'Dirty', phone: '555-0004' },
  ]);
  const dirty = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, ['people', 'dirty'])) as object;
  await db.put(REPLICATION_STORES.REPLICATED_TABLES, { ...dirty, isDirty: true });
  await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
    id: 'm1',
    tableName: 'people',
    rowId: 'queued',
    operation: 'INSERT',
  });

  const result = await batch.redactCleanRows(redact);

  expect(result.redacted).toEqual(['sent']);
  expect(result.kept.sort()).toEqual(['dirty', 'localOnly', 'queued']);
  expect(await dataOf('sent')).toEqual({ id: 'sent', firstName: 'Sent', phone: null });
  expect((await dataOf('localOnly')).phone).toBe('555-0002');
  expect((await dataOf('queued')).phone).toBe('555-0003');
  expect((await dataOf('dirty')).phone).toBe('555-0004');
});

it('a failed mutation keeps its row whole, and a second run changes nothing', async () => {
  await batch.batchSet([{ id: 'failed', firstName: 'Failed', phone: '555-0005' }]);
  await db.put(REPLICATION_STORES.FAILED_MUTATIONS, {
    id: 'f1',
    tableName: 'people',
    rowId: 'failed',
    operation: 'INSERT',
  });
  expect((await batch.redactCleanRows(redact)).kept).toEqual(['failed']);
  expect((await dataOf('failed')).phone).toBe('555-0005');

  await batch.batchSet([{ id: 'sent', firstName: 'Sent', phone: '555-0001' }]);
  await batch.redactCleanRows(redact);
  expect((await batch.redactCleanRows(redact)).redacted).toEqual([]);
});
