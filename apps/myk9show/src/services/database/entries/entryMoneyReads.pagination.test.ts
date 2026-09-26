import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-767: every entries read that names MYK9-639's `moved_from_entry_id` is
 * summed as money (or feeds a class report), and PostgREST caps one response
 * at `max_rows` (1000, supabase/config.toml). MYK9-761 paged the show-scoped
 * read; the trial- and class-scoped reads read one response, so a scope larger
 * than one page was silently understated.
 *
 * Every read here must return every row, fail whole when a page fails, and keep
 * paging after `withMoveUpLinkFallback` drops the link column on a database
 * that does not have it yet.
 */

const MAX_ROWS = 1000;

type Row = {
  id: string;
  created_at: string | null;
  run_order: number | null;
  show_id: string;
  class: { id: string };
};

const { mockEntriesTable, mockClassesTable, server } = vi.hoisted(() => ({
  mockEntriesTable: {
    sync: vi.fn(),
    getEntriesByShow: vi.fn(),
    getEntriesByClass: vi.fn(),
    getAll: vi.fn(),
    get getAllOrThrow() {
      return this.getAll;
    },
    getSyncMetadata: vi.fn(),
    getReplicatedRow: vi.fn(),
  },
  mockClassesTable: {
    getAll: vi.fn(),
    get getAllOrThrow() {
      return this.getAll;
    },
    getClassesByTrial: vi.fn(),
  },
  server: {
    rows: [] as Row[],
    failOnPage: null as number | null,
    schemaHasMoveUpLink: true,
    pagesServed: 0,
    selects: [] as string[],
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { getAllShows: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getAll: vi.fn().mockResolvedValue([]),
    get getAllOrThrow() {
      return this.getAll;
    },
    getTrialsByShow: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  loadHandlerPeople: vi.fn().mockResolvedValue(new Map()),
}));

// A PostgREST stand-in that never returns more than `max_rows`, whether the
// caller asks for a `.range()` or awaits the builder bare. It honours the
// `.lt('id')` keyset, and answers 42703 for the whole request when the select
// names `moved_from_entry_id` on a schema that lacks it.
vi.mock('@/services/database/supabaseClient', () => {
  const byIdDesc = (a: Row, b: Row) => b.id.localeCompare(a.id);
  const query = () => {
    let cursor: string | null = null;
    let columns = '';
    const respond = (from: number, to: number) => {
      server.selects.push(columns);
      if (!server.schemaHasMoveUpLink && columns.includes('moved_from_entry_id')) {
        return Promise.resolve({
          data: null,
          error: { code: '42703', message: 'column entries.moved_from_entry_id does not exist' },
        });
      }
      const page = server.pagesServed++;
      if (server.failOnPage === page) {
        return Promise.resolve({
          data: null,
          error: { message: 'upstream timeout', code: '57014' },
        });
      }
      const visible = [...server.rows].sort(byIdDesc).filter(row => !cursor || row.id < cursor);
      return Promise.resolve({
        data: visible.slice(from, Math.min(to + 1, from + MAX_ROWS)),
        error: null,
      });
    };
    const builder = {
      select: (selected: string) => {
        columns = selected;
        return builder;
      },
      eq: () => builder,
      is: () => builder,
      order: () => builder,
      lt: (column: string, value: string) => {
        if (column !== 'id') throw new Error(`unexpected keyset column ${column}`);
        cursor = value;
        return builder;
      },
      range: (from: number, to: number) => respond(from, to),
      then: <R>(onFulfilled: (value: unknown) => R, onRejected?: (reason: unknown) => R) =>
        respond(0, Number.MAX_SAFE_INTEGER).then(onFulfilled, onRejected),
    };
    return builder;
  };
  return { supabase: { from: () => query() }, logQuery: vi.fn(), createDatabaseError };
});

import {
  getEntriesByClass,
  getEntriesByShowForFinancials,
  getEntriesByTrial,
} from '@/services/database/entries';

const ROW_COUNT = 2345;

function makeRows(count: number): Row[] {
  const base = Date.parse('2026-09-01T00:00:00.000Z');
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${String(i).padStart(5, '0')}`,
    created_at: new Date(base + Math.floor(i / 3) * 1000).toISOString(),
    run_order: count - i,
    show_id: 's1',
    class: { id: 'c1' },
  }));
}

const ids = (rows: unknown[]) => rows.map(row => (row as Record<string, unknown>).id as string);

const reads = [
  { name: 'getEntriesByTrial', read: () => getEntriesByTrial('t1') },
  { name: 'getEntriesByClass', read: () => getEntriesByClass('c1') },
  { name: 'getEntriesByShowForFinancials', read: () => getEntriesByShowForFinancials('s1') },
] as const;

beforeEach(() => {
  // Every scope is cold locally, so each read goes online.
  mockEntriesTable.sync.mockReset();
  mockEntriesTable.sync.mockResolvedValue({ success: false });
  mockEntriesTable.getSyncMetadata.mockReset();
  mockEntriesTable.getSyncMetadata.mockResolvedValue({ tableName: 'entries' });
  mockEntriesTable.getEntriesByShow.mockReset();
  mockEntriesTable.getEntriesByShow.mockResolvedValue([
    { id: 'entry-00000', showId: 's1', dogId: null, classId: null, deletedAt: null },
  ]);
  mockEntriesTable.getEntriesByClass.mockReset();
  mockEntriesTable.getEntriesByClass.mockResolvedValue([]);
  mockEntriesTable.getAll.mockReset();
  mockEntriesTable.getAll.mockResolvedValue([]);
  mockEntriesTable.getReplicatedRow.mockReset();
  mockEntriesTable.getReplicatedRow.mockResolvedValue({ isDirty: false });
  mockClassesTable.getAll.mockReset();
  mockClassesTable.getAll.mockResolvedValue([]);
  mockClassesTable.getClassesByTrial.mockReset();
  mockClassesTable.getClassesByTrial.mockResolvedValue([{ id: 'c1', trialId: 't1' }]);
  server.rows = makeRows(ROW_COUNT);
  server.failOnPage = null;
  server.schemaHasMoveUpLink = true;
  server.pagesServed = 0;
  server.selects = [];
});

describe.each(reads)('$name online read, larger than one PostgREST page', ({ read }) => {
  it('returns every row across pages, not the first 1000', async () => {
    const result = await read();

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(ROW_COUNT);
    expect(new Set(ids(result.data)).size).toBe(ROW_COUNT);
  });

  it('fails the whole read when a later page fails, never a partial total', async () => {
    server.failOnPage = 1;

    const result = await read();

    expect(result.error).not.toBeNull();
    // No online page reaches the caller: never the first 1000 rows as a total.
    expect(ids(result.data).filter(id => id !== 'entry-00000')).toEqual([]);
  });

  it('keeps paging without the move-up link when the schema lacks it', async () => {
    server.schemaHasMoveUpLink = false;

    const result = await read();

    expect(result.error).toBeNull();
    expect(new Set(ids(result.data)).size).toBe(ROW_COUNT);
    // One refused request, then every page read without the link: the fallback
    // is decided once, not re-tried (and re-refused) on every page.
    const withLink = server.selects.filter(columns => columns.includes('moved_from_entry_id'));
    expect(withLink).toHaveLength(1);
    expect(server.selects).toHaveLength(1 + Math.ceil(ROW_COUNT / MAX_ROWS));
  });
});

describe('row order after paging by id', () => {
  const sample: Row[] = [
    {
      id: 'b',
      created_at: '2026-09-02T00:00:00.000Z',
      run_order: 2,
      show_id: 's1',
      class: { id: 'c1' },
    },
    { id: 'a', created_at: null, run_order: null, show_id: 's1', class: { id: 'c1' } },
    {
      id: 'c',
      created_at: '2026-09-03T00:00:00.000Z',
      run_order: 3,
      show_id: 's1',
      class: { id: 'c1' },
    },
    {
      id: 'd',
      created_at: '2026-09-02T00:00:00.000Z',
      run_order: 1,
      show_id: 's1',
      class: { id: 'c1' },
    },
  ];

  it('returns trial rows newest first, null timestamps last', async () => {
    server.rows = sample;

    const result = await getEntriesByTrial('t1');

    expect(ids(result.data)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('returns class rows in run order, unordered rows last', async () => {
    server.rows = sample;

    const result = await getEntriesByClass('c1');

    expect(ids(result.data)).toEqual(['d', 'b', 'c', 'a']);
  });
});
