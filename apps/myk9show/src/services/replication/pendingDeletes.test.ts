import { describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import type { PendingMutation } from '@myk9/replication';
import { deletePayload, PendingDeletes } from './pendingDeletes';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mutation = (
  rowId: string,
  operation: PendingMutation['operation'],
  data: Record<string, unknown>
) => fromAny<PendingMutation, unknown>({ rowId, operation, data, tableName: 'trials' });

describe('deletePayload (MYK9-762)', () => {
  it('records the show only for a row that was already on the server', () => {
    expect(deletePayload('t1', { showId: 'show-1' })).toEqual({ id: 't1', show_id: 'show-1' });
    expect(deletePayload('t1', { showId: 'show-1', _localOnly: true })).toEqual({ id: 't1' });
    expect(deletePayload('t1', { showId: undefined })).toEqual({ id: 't1' });
    expect(deletePayload('t1', null)).toEqual({ id: 't1' });
  });
});

describe('PendingDeletes (MYK9-762)', () => {
  function ledger(pending: PendingMutation[] | Error) {
    const deletes = new PendingDeletes('trials');
    deletes.attach({
      getPendingMutationsForTable: vi.fn(async () => {
        if (pending instanceof Error) throw pending;
        return pending;
      }),
    });
    return deletes;
  }

  it('counts only queued DELETEs of server-backed rows in the show asked about', async () => {
    const deletes = ledger([
      mutation('t1', 'DELETE', { id: 't1', show_id: 'show-1' }),
      mutation('t2', 'DELETE', { id: 't2', show_id: 'show-2' }),
      mutation('local', 'DELETE', { id: 'local' }),
      mutation('t3', 'UPDATE', { id: 't3', show_id: 'show-1' }),
    ]);

    await expect(deletes.coveredIds('show-1')).resolves.toEqual(new Set(['t1']));
    await expect(deletes.coveredIds()).resolves.toEqual(new Set(['t1', 't2']));
    await expect(deletes.allIds()).resolves.toEqual(new Set(['t1', 't2', 'local']));
  });

  it('counts nothing when the queue cannot be read or is not wired', async () => {
    await expect(ledger(new Error('signed out')).coveredIds('show-1')).resolves.toEqual(new Set());
    await expect(new PendingDeletes('trials').coveredIds('show-1')).resolves.toEqual(new Set());
  });
});
