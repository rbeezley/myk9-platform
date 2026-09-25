import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-761: the Financial Summary's online read is summed as money, and
 * PostgREST caps one response at `max_rows` (1000). The read must page past
 * that, fail whole when a page fails, and neither double-count nor skip a row
 * when an entry is inserted between two page requests (Codex P2 on c1a447052:
 * newest-first OFFSET paging shifts the boundary on every insert).
 */

const MAX_ROWS = 1000;

type Row = { id: string; created_at: string; show_id: string; entry_fee: number };

const { mockEntriesTable, server } = vi.hoisted(() => ({
  mockEntriesTable: {
    sync: vi.fn(),
    getEntriesByShow: vi.fn(),
    getSyncMetadata: vi.fn(),
    getReplicatedRow: vi.fn(),
  },
  server: {
    rows: [] as Row[],
    failOnPage: null as number | null,
    pagesServed: 0,
    afterPage: null as null | ((page: number) => void),
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getAll: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  loadHandlerPeople: vi.fn().mockResolvedValue(new Map()),
}));

// A PostgREST stand-in: newest first by (created_at, id), honours the keyset
// `.or()` filter and `.range()`, never returns more than `max_rows`, and reads
// the table as it is at the moment each page is requested.
vi.mock('@/services/database/supabaseClient', () => {
  const newestFirst = (a: Row, b: Row) =>
    b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
  const query = () => {
    let cursor: { createdAt: string; id: string } | null = null;
    const respond = (from: number, to: number) => {
      const page = server.pagesServed++;
      if (server.failOnPage === page) {
        return Promise.resolve({
          data: null,
          error: { message: 'upstream timeout', code: '57014' },
        });
      }
      const visible = [...server.rows]
        .sort(newestFirst)
        .filter(
          row =>
            !cursor ||
            row.created_at < cursor.createdAt ||
            (row.created_at === cursor.createdAt && row.id < cursor.id)
        );
      const data = visible.slice(from, Math.min(to + 1, from + MAX_ROWS));
      server.afterPage?.(page);
      return Promise.resolve({ data, error: null });
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      order: () => builder,
      or: (filter: string) => {
        const match =
          /^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/.exec(filter);
        if (!match || match[1] !== match[2]) throw new Error(`unexpected keyset filter ${filter}`);
        cursor = { createdAt: match[1]!, id: match[3]! };
        return builder;
      },
      range: (from: number, to: number) => respond(from, to),
    };
    return builder;
  };
  return { supabase: { from: () => query() }, logQuery: vi.fn(), createDatabaseError };
});

import { getEntriesByShowForFinancials } from '@/services/database/entries';

// Three rows share each timestamp, so page boundaries fall inside ties and the
// id tie-break is exercised.
function makeRows(count: number): Row[] {
  const base = Date.parse('2026-09-01T00:00:00.000Z');
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${String(i).padStart(5, '0')}`,
    created_at: new Date(base + Math.floor(i / 3) * 1000).toISOString(),
    show_id: 's1',
    entry_fee: 35,
  }));
}

const ids = (rows: unknown[]) => rows.map(row => (row as Record<string, unknown>).id as string);

describe('getEntriesByShowForFinancials online read, larger than one PostgREST page', () => {
  beforeEach(() => {
    // A never-synced show whose one local row holds no unsaved write: the read
    // goes online (see getEntriesByShowForFinancials.showSync.test.ts).
    mockEntriesTable.sync.mockReset();
    mockEntriesTable.sync.mockResolvedValue({ success: false });
    mockEntriesTable.getSyncMetadata.mockReset();
    mockEntriesTable.getSyncMetadata.mockResolvedValue({ tableName: 'entries' });
    mockEntriesTable.getEntriesByShow.mockReset();
    mockEntriesTable.getEntriesByShow.mockResolvedValue([
      { id: 'entry-00000', showId: 's1', dogId: null, classId: null, deletedAt: null },
    ]);
    mockEntriesTable.getReplicatedRow.mockReset();
    mockEntriesTable.getReplicatedRow.mockResolvedValue({ isDirty: false });
    server.rows = makeRows(2345);
    server.failOnPage = null;
    server.pagesServed = 0;
    server.afterPage = null;
  });

  it('returns every row across pages, not the first 1000', async () => {
    const result = await getEntriesByShowForFinancials('s1');

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2345);
    expect(new Set(ids(result.data)).size).toBe(2345);
  });

  it('neither double-counts nor skips a row when an entry is inserted between pages', async () => {
    const original = makeRows(2345).map(row => row.id);
    server.afterPage = page => {
      if (page === 0) {
        server.rows.push({
          id: 'entry-registered-mid-read',
          created_at: '2026-09-30T00:00:00.000Z',
          show_id: 's1',
          entry_fee: 35,
        });
      }
    };

    const result = await getEntriesByShowForFinancials('s1');

    expect(result.error).toBeNull();
    const read = ids(result.data);
    expect(new Set(read).size).toBe(read.length);
    expect(read.filter(id => id !== 'entry-registered-mid-read').sort()).toEqual(original.sort());
  });

  it('fails the whole read when a later page fails, never a partial total', async () => {
    server.failOnPage = 1;

    const result = await getEntriesByShowForFinancials('s1');

    // The Financial Summary throws on `error`, so no total is rendered at all.
    expect(result.error).not.toBeNull();
    expect(result.data).not.toHaveLength(MAX_ROWS);
  });
});
