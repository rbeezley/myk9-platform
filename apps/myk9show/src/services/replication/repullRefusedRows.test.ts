import { describe, expect, it, vi } from 'vitest';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isFinalRefusal, repullRows, type RepullableTable } from './repullRefusedRows';

type Local = { id: string; name: string };
type Remote = { id: string; name: string; version: number };

function makeTable(remoteRows: Remote[], pending: Record<string, string[]> = {}) {
  const table: RepullableTable<Remote, Local> = {
    getTableName: () => 'people',
    getRefetchAdapter: () => ({
      fetchRowsById: vi.fn(async (ids: string[]) => remoteRows.filter(r => ids.includes(r.id))),
      getRemoteId: (remote: Remote) => remote.id,
      toLocalRow: (remote: Remote) => ({ id: remote.id, name: remote.name }),
    }),
    getPendingMutationIdsForRow: vi.fn(async (id: string) => pending[id] ?? []),
    replaceFromRemote: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  return table;
}

describe('repullRows (MYK9-1071, D3)', () => {
  it('replaces a refused row with the server copy and its version', async () => {
    const table = makeTable([{ id: 'p1', name: 'Server', version: 7 }]);
    const result = await repullRows(table, ['p1']);
    expect(table.replaceFromRemote).toHaveBeenCalledWith('p1', { id: 'p1', name: 'Server' }, 7);
    expect(result).toEqual({ replaced: ['p1'], removed: [], skipped: [] });
  });

  it('removes a row the server does not return (a refused INSERT)', async () => {
    const table = makeTable([]);
    const result = await repullRows(table, ['local-only']);
    expect(table.delete).toHaveBeenCalledWith('local-only');
    expect(result.removed).toEqual(['local-only']);
  });

  it('leaves a row with a pending mutation alone', async () => {
    const table = makeTable([{ id: 'p1', name: 'Server', version: 7 }], { p1: ['m-2'] });
    const result = await repullRows(table, ['p1']);
    expect(table.replaceFromRemote).not.toHaveBeenCalled();
    expect(table.delete).not.toHaveBeenCalled();
    expect(result.skipped).toEqual(['p1']);
  });

  it('treats permanent and authorization failures as final, max-retries as not', () => {
    expect(isFinalRefusal({ failureKind: 'permanent' })).toBe(true);
    expect(isFinalRefusal({ failureKind: 'authorization' })).toBe(true);
    expect(isFinalRefusal({ failureKind: 'max-retries' })).toBe(false);
    expect(isFinalRefusal({})).toBe(false);
  });
});
