/**
 * MYK9-1624: every SYNC-PATH delete goes through the sync's cache writer, so a
 * response that arrives after the sync was cancelled deletes nothing.
 *
 * The declared list below names each adapter hook that deletes. Each is driven
 * with a server response held until after the abort; the cached row must
 * survive. The final test fails when a Replicated*Table calls a delete sink
 * directly instead of through the writer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPLICATION_STORES, SyncCacheWriter, databaseManager } from '@myk9/replication';
import { ReplicatedClubsTable } from '../ReplicatedClubsTable';
import { ReplicatedTrialsTable } from '../ReplicatedTrialsTable';
import { ReplicatedArmbandsTable } from '../ReplicatedArmbandsTable';

const server = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  gate: null as Promise<void> | null,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (tableName: string) => {
      let head = false;
      const builder: Record<string, unknown> = {};
      for (const method of ['eq', 'is', 'in', 'gt', 'or', 'order', 'range', 'limit']) {
        builder[method] = () => builder;
      }
      builder.select = (_columns: string, options?: { head?: boolean }) => {
        head = options?.head === true;
        return builder;
      };
      builder.abortSignal = () => builder;
      builder.then = (resolve: (value: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(head ? null : server.gate)
          .then(() => {
            const rows = server.rows[tableName] ?? [];
            return head ? { count: rows.length, error: null } : { data: rows, error: null };
          })
          .then(resolve, reject);
      return builder;
    },
  },
}));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const stamp = '2026-10-01T12:00:00.000Z';

async function cachedRow(tableName: string, id: string) {
  const db = await databaseManager.getDatabase('tests');
  return db.get(REPLICATION_STORES.REPLICATED_TABLES, [tableName, id]);
}

/** Hold the server's answer; `release` lets it arrive. */
function holdServer() {
  let release!: () => void;
  server.gate = new Promise<void>(resolve => {
    release = resolve;
  });
  return release;
}

const settleBackgroundWork = () => new Promise(resolve => setTimeout(resolve, 25));

describe('late responses after a cancelled sync delete nothing (MYK9-1624)', () => {
  beforeEach(async () => {
    await databaseManager.reset();
    server.rows = {};
    server.gate = null;
  });
  afterEach(async () => {
    server.gate = null;
    await databaseManager.reset();
  });

  // The declared list: every adapter hook that deletes in the sync path.
  interface TombstoneSite {
    hook: string;
    tableName: string;
    make: () => { sync: (scope: string, options: { signal: AbortSignal }) => Promise<unknown> };
    seed: (table: never) => Promise<unknown>;
    response: Record<string, unknown>[];
    scope: string;
    id: string;
  }
  const tombstoneSites: TombstoneSite[] = [
    {
      hook: 'trials fetchRemoteRows tombstone',
      tableName: 'trials',
      make: () => new ReplicatedTrialsTable(),
      seed: (table: ReplicatedTrialsTable) =>
        table.set('t1', { id: 't1', showId: 'show-1', name: 't1', date: '2026-10-10' } as never),
      response: [
        {
          id: 't1',
          show_id: 'show-1',
          name: 't1',
          date: '2026-10-10',
          deleted_at: stamp,
          updated_at: stamp,
          version: 2,
        },
      ],
      scope: 'show-1',
      id: 't1',
    },
    {
      hook: 'armbands fetchRemoteRows tombstone',
      tableName: 'armbands',
      make: () => new ReplicatedArmbandsTable(),
      seed: (table: ReplicatedArmbandsTable) =>
        table.set('a1', {
          id: 'a1',
          showId: 'show-1',
          armbandNumber: '101',
          isAvailable: false,
        } as never),
      response: [
        {
          id: 'a1',
          show_id: 'show-1',
          armband_number: '101',
          is_available: true,
          updated_at: stamp,
          version: 2,
        },
      ],
      scope: '',
      id: 'a1',
    },
  ];

  it.each(tombstoneSites)(
    '$hook: the tombstone arrives after the abort and the cached row survives',
    async site => {
      const table = site.make();
      await site.seed(table as never);
      expect(await cachedRow(site.tableName, site.id)).toBeDefined();
      server.rows[site.tableName] = [...site.response];
      const release = holdServer();
      const controller = new AbortController();

      const pending = table.sync(site.scope, { signal: controller.signal });
      await settleBackgroundWork();
      controller.abort();
      release();
      await pending;
      await settleBackgroundWork();

      expect(await cachedRow(site.tableName, site.id)).toBeDefined();
    }
  );

  it.each(tombstoneSites)('$hook: a live sync still removes the tombstoned row', async site => {
    const table = site.make();
    await site.seed(table as never);
    server.rows[site.tableName] = [...site.response];
    // Ordering only: the tombstone is applied by a live, un-cancelled sync.
    await table.sync(site.scope, { signal: new AbortController().signal });
    expect(await cachedRow(site.tableName, site.id)).toBeUndefined();
  });
  it('clubs reconcileVisibility: the id list arrives after the abort and the cached club survives', async () => {
    const table = new ReplicatedClubsTable();
    await table.set('club-stale', { id: 'club-stale', name: 'Stale' } as never);
    server.rows.clubs = [{ id: 'club-live' }];
    const release = holdServer();
    const controller = new AbortController();

    const pending = table.reconcileVisibility(new SyncCacheWriter(table, controller.signal));
    await settleBackgroundWork();
    controller.abort();
    release();
    await pending;

    expect(await cachedRow('clubs', 'club-stale')).toBeDefined();
  });

  it('clubs reconcileVisibility: the same call un-cancelled removes the stale club (positive control)', async () => {
    const table = new ReplicatedClubsTable();
    await table.set('club-stale', { id: 'club-stale', name: 'Stale' } as never);
    server.rows.clubs = [{ id: 'club-live' }];

    await table.reconcileVisibility(new SyncCacheWriter(table, new AbortController().signal));

    expect(await cachedRow('clubs', 'club-stale')).toBeUndefined();
  });
});

// The declared list of raw delete calls left in Replicated*Table.ts. Each is a
// USER-initiated delete (never blocked by a pass) or sits inside a SyncCacheWriter
// `guarded` call. A new sync-path delete that skips the writer changes a count
// here and fails; route it through `cache`, or declare it with its reason.
const sources = import.meta.glob('../Replicated*Table.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const DECLARED_RAW_DELETES: Record<string, Record<string, number>> = {
  // confirmDeleted (user: a queued DELETE the server confirmed) + the guarded run().
  'ReplicatedDogRegistrationsTable.ts': {
    'removeResolvedPlaceholders(db': 2,
    'pruneRegistrationsMissingFromServer(': 1,
    'this.delete(': 1,
  },
  // moves, withdrawals and undo: user mutations.
  'ReplicatedEntriesTable.ts': { 'this.delete(': 3 },
  'ReplicatedJudgeAssignmentsTable.ts': { 'this.delete(': 1 },
};
const RAW_SINKS = [
  'deleteRowsIfClean(',
  'removeStaleEntries(',
  'batchDelete(',
  'clearCache(',
  'this.delete(',
  'removeResolvedPlaceholders(db',
  'pruneRegistrationsMissingFromServer(',
];

const codeOnly = (source: string) =>
  source
    .split('\n')
    .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n');

describe('declared raw deletes in Replicated*Table.ts (MYK9-1624)', () => {
  it('finds the table sources (positive control)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
  });

  it.each(Object.entries(sources))('%s calls no undeclared delete sink', (path, source) => {
    const file = path.split('/').pop()!;
    const code = codeOnly(source);
    const found: Record<string, number> = {};
    for (const sink of RAW_SINKS) {
      const count = code.split(sink).length - 1;
      if (count > 0) found[sink] = count;
    }
    // removeStaleEntries( is only legal as a mention in a doc comment: none in code.
    expect(found).toEqual(DECLARED_RAW_DELETES[file] ?? {});
  });
});
