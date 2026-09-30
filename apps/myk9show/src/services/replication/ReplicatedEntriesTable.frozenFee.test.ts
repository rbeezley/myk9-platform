/**
 * MYK9-878: the fee is fixed at entry creation, then frozen.
 *
 * A junior-owner desk entry is created offline at the regular fee and the server
 * trigger lowers the INSERT to the junior fee. The INSERT ack returns only the id,
 * so the local row keeps the regular fee until the next pull. A queued UPDATE that
 * uploads the whole row would then write the regular fee back over the server-priced
 * one and leave a paid entry out of step with its ledger payment. UPDATEs therefore
 * never carry `entry_fee` unless the caller actually edited it.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const entry: ReplicatedEntry = {
  id: 'entry-1',
  showId: 'show-1',
  classId: 'class-1',
  dogId: 'dog-1',
  entryStatus: 'confirmed',
  entryFee: 30,
} as ReplicatedEntry;

describe('entry fee is frozen after creation (MYK9-878)', () => {
  let table: ReplicatedEntriesTable;
  let queued: Array<{ type: string; payload: Record<string, unknown> }>;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    queued = [];
    vi.spyOn(
      table as unknown as { queueMutation: (...args: unknown[]) => Promise<string> },
      'queueMutation'
    ).mockImplementation((async (type: string, _id: string, payload: Record<string, unknown>) => {
      queued.push({ type, payload });
      return `mutation-${queued.length}`;
    }) as never);
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('a status update queued after the priced-down INSERT does not write the regular fee back', async () => {
    await table.createEntry(entry);
    await table.updateEntryStatus('entry-1', 'withdrawn');

    expect(queued.map(m => m.type)).toEqual(['INSERT', 'UPDATE']);
    expect(queued[0]?.payload.entry_fee).toBe(30);
    expect(queued[1]?.payload).not.toHaveProperty('entry_fee');
    expect(queued[1]?.payload).toHaveProperty('entry_status', 'withdrawn');
  });

  it('a general update that does not touch the fee does not write it either', async () => {
    await table.createEntry(entry);
    await table.updateEntry('entry-1', { specialRequests: 'note' });

    expect(queued[1]?.payload).not.toHaveProperty('entry_fee');
  });

  it('a caller that really edits the fee still sends it', async () => {
    await table.createEntry(entry);
    await table.updateEntry('entry-1', { entryFee: 12 });

    expect(queued[1]?.payload.entry_fee).toBe(12);
  });
});
