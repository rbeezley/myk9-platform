import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { DatabaseManager, REPLICATION_STORES } from './DatabaseManager';
import { ReplicatedTableBatchManager } from './ReplicatedTableBatch';
import { replaceRefusedRows } from './replaceRefusedRows';
import type { ReplicatedRow } from '../types';

type Row = { id: string; name: string };
let manager: DatabaseManager;
let db: IDBPDatabase;
let batch: ReplicatedTableBatchManager<Row>;

beforeEach(async () => {
  manager = new DatabaseManager({}, `refused-${crypto.randomUUID()}`, 5);
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

const versionOf = async (id: string) =>
  ((await db.get(REPLICATION_STORES.REPLICATED_TABLES, ['people', id])) as ReplicatedRow<Row>)
    ?.version;

it('replaces or removes refused rows, but keeps a re-edited, queued or newer row (MYK9-1071)', async () => {
  await batch.batchSet(
    ['ok', 'gone', 'edited', 'queued', 'newer'].map(id => ({ id, name: 'refused' })),
    new Map([['newer', 9]])
  );
  const v = Object.fromEntries(
    await Promise.all(
      ['ok', 'gone', 'edited', 'queued', 'newer'].map(async id => [id, await versionOf(id)])
    )
  ) as Record<string, number>;
  // A new edit after the fetch: the local revision moves.
  await batch.batchSet([{ id: 'edited', name: 'new edit' }]);
  await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
    id: 'm-1',
    tableName: 'people',
    rowId: 'queued',
    operation: 'UPDATE',
    data: {},
    timestamp: 1,
    retries: 0,
    status: 'pending',
  });

  const result = await replaceRefusedRows<Row>(db, 'people', [
    {
      id: 'ok',
      expectedRowVersion: v.ok,
      remote: { id: 'ok', name: 'server' },
      remoteServerVersion: 3,
    },
    { id: 'gone', expectedRowVersion: v.gone, remote: null },
    { id: 'edited', expectedRowVersion: v.edited, remote: { id: 'edited', name: 'server' } },
    { id: 'queued', expectedRowVersion: v.queued, remote: { id: 'queued', name: 'server' } },
    {
      id: 'newer',
      expectedRowVersion: v.newer,
      remote: { id: 'newer', name: 'old' },
      remoteServerVersion: 4,
    },
  ]);

  expect(result).toEqual({
    replaced: ['ok'],
    removed: ['gone'],
    skipped: ['edited', 'queued', 'newer'],
  });
  const ok = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
    'people',
    'ok',
  ])) as ReplicatedRow<Row>;
  expect(ok).toMatchObject({ data: { name: 'server' }, isDirty: false, serverVersion: 3 });
  expect(await db.get(REPLICATION_STORES.REPLICATED_TABLES, ['people', 'gone'])).toBeUndefined();
  expect(
    (
      (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
        'people',
        'edited',
      ])) as ReplicatedRow<Row>
    ).data.name
  ).toBe('new edit');
});
