import { describe, expect, it, vi } from 'vitest';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isFinalRefusal, repullRows, type RepullableTable } from './repullRefusedRows';

type Local = { id: string; name: string };
type Remote = { id: string; name: string; version: number };

function makeTable(remoteRows: Remote[]) {
  const replaceRefusedRows = vi.fn(async () => ({ replaced: [], removed: [], skipped: [] }));
  const table: RepullableTable<Remote, Local> = {
    getTableName: () => 'people',
    getRefetchAdapter: () => ({
      fetchRowsById: vi.fn(async (ids: string[]) => remoteRows.filter(r => ids.includes(r.id))),
      getRemoteId: (remote: Remote) => remote.id,
      toLocalRow: (remote: Remote) => ({ id: remote.id, name: remote.name }),
    }),
    getReplicatedRow: vi.fn(async (id: string) =>
      id === 'missing-locally' ? null : ({ version: id === 'p1' ? 4 : 2 } as never)
    ),
    replaceRefusedRows,
  };
  return { table, replaceRefusedRows };
}

describe('repullRows (MYK9-1071, D3)', () => {
  it('hands the atomic replace the pre-fetch local revision, the server copy and its version', async () => {
    const { table, replaceRefusedRows } = makeTable([{ id: 'p1', name: 'Server', version: 7 }]);
    await repullRows(table, ['p1', 'gone', 'p1']);

    expect(replaceRefusedRows).toHaveBeenCalledWith([
      {
        id: 'p1',
        expectedRowVersion: 4,
        remote: { id: 'p1', name: 'Server' },
        remoteServerVersion: 7,
      },
      { id: 'gone', expectedRowVersion: 2, remote: null, remoteServerVersion: undefined },
    ]);
  });

  it('treats permanent and authorization failures as final, max-retries as not', () => {
    expect(isFinalRefusal({ failureKind: 'permanent' })).toBe(true);
    expect(isFinalRefusal({ failureKind: 'authorization' })).toBe(true);
    expect(isFinalRefusal({ failureKind: 'max-retries' })).toBe(false);
    expect(isFinalRefusal({})).toBe(false);
  });
});
