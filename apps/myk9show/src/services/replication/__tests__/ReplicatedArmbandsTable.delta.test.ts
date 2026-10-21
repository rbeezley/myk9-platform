import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REPLICATION_INCREMENTAL_BUFFER_MS,
  configureConflictSurfacing,
  configureRemoteCountCadence,
  parseUpdatedAtMs,
  resetRemoteCountCadenceForTests,
} from '@myk9/replication';
import { ReplicatedArmbandsTable } from '../ReplicatedArmbandsTable';
import { POSTGREST_MAX_ROWS } from '../postgrestMaxRows';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@myk9/core', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const T1 = '2026-10-21T10:00:00.000Z';
const T2 = '2026-10-21T10:05:00.000Z';
const T3 = '2026-10-21T10:10:00.000Z';

function remoteRow(
  id: string,
  number: string,
  updatedAt: string,
  isAvailable = false,
  showId = 'show-1'
) {
  return {
    version: 1,
    id,
    show_id: showId,
    dog_id: isAvailable ? null : `dog-${id}`,
    armband_number: number,
    is_available: isAvailable,
    updated_at: updatedAt,
  };
}

/** One query builder serves the delta and the count: it answers with the rows and count set below. */
function mockQuery(supabaseFrom: { mockReturnValue: (value: never) => unknown }) {
  const state: {
    data: unknown[];
    pages: unknown[][];
    count: number | undefined;
    /** Every row read's filters, one entry per request: `method(args)`. */
    rowReads: string[][];
  } = { data: [], pages: [], count: undefined, rowReads: [] };
  let countOnly = false;
  let filters: string[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      filters.push(`${method}(${args.map(arg => JSON.stringify(arg)).join(',')})`);
      return query;
    };
  const query = {
    select: vi.fn((_columns: string, options?: { head?: boolean }) => {
      countOnly = options?.head === true;
      filters = [];
      return query;
    }),
    eq: vi.fn(record('eq')),
    gt: vi.fn(record('gt')),
    order: vi.fn(record('order')),
    or: vi.fn(record('or')),
    range: vi.fn(record('range')),
    // A count reads no rows; a row read takes a queued page first, otherwise `data`.
    then: (resolve: (value: unknown) => unknown) => {
      if (!countOnly) state.rowReads.push(filters);
      return Promise.resolve(
        countOnly
          ? { count: state.count, data: null, error: null }
          : {
              count: state.count,
              data: state.pages.length > 0 ? state.pages.shift() : state.data,
              error: null,
            }
      ).then(resolve);
    },
  };
  supabaseFrom.mockReturnValue(query as never);
  return { query, state };
}

describe('ReplicatedArmbandsTable incremental sync (MYK9-1300)', () => {
  let table: ReplicatedArmbandsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    resetRemoteCountCadenceForTests();
    table = new ReplicatedArmbandsTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    resetRemoteCountCadenceForTests();
    await databaseManager.reset();
  });

  async function primedQuery() {
    const { supabase } = await import('@/services/database/supabaseClient');
    const { query, state } = mockQuery(vi.mocked(supabase.from));
    state.data = [remoteRow('a', '101', T1), remoteRow('b', '102', T2)];
    state.count = 2;
    expect((await table.sync()).success).toBe(true);
    query.eq.mockClear();
    query.gt.mockClear();
    query.order.mockClear();
    // Stale cleanup spares rows written in the same millisecond as the fetch start.
    await new Promise(resolve => setTimeout(resolve, 5));
    return { query, state };
  }

  it('a steady-state pass reads only rows after the watermark and downloads nothing', async () => {
    const { query, state } = await primedQuery();
    state.data = [];

    const result = await table.sync();

    expect(result).toMatchObject({ success: true, operation: 'incremental-sync', rowsAffected: 0 });
    expect(query.gt).toHaveBeenCalledWith(
      'updated_at',
      new Date(Date.parse(T2) - REPLICATION_INCREMENTAL_BUFFER_MS).toISOString()
    );
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: true });
    expect(query.eq).not.toHaveBeenCalledWith('is_available', false);
    expect(query.eq).not.toHaveBeenCalledWith('show_id', expect.anything());
    expect(await table.getByShow('show-1')).toHaveLength(2);
  });

  it('a first or full pass keeps the assigned-only read', async () => {
    const { supabase } = await import('@/services/database/supabaseClient');
    const { query, state } = mockQuery(vi.mocked(supabase.from));
    state.data = [remoteRow('a', '101', T1)];
    state.count = 1;

    await table.sync();

    expect(query.eq).toHaveBeenCalledWith('is_available', false);
    expect(query.gt).not.toHaveBeenCalled();
  });

  it('a forced call (the offline-readiness prime) runs a full sync on a warm replica', async () => {
    const { query } = await primedQuery();

    const result = await table.sync('', { forceFullSync: true });

    expect(result.operation).toBe('full-sync');
    expect(query.eq).toHaveBeenCalledWith('is_available', false);
    expect(query.gt).not.toHaveBeenCalled();
  });

  it('caches an assignment and a reassignment that arrive in the delta', async () => {
    const { state } = await primedQuery();
    state.data = [{ ...remoteRow('a', '201', T3), dog_id: 'dog-new' }, remoteRow('c', '103', T3)];

    await table.sync();

    expect(await table.get('a')).toMatchObject({ armbandNumber: '201', dogId: 'dog-new' });
    expect(await table.get('c')).toMatchObject({ armbandNumber: '103', isAvailable: false });
  });

  it('removes the clean local copy of a released armband and never caches it', async () => {
    const { state } = await primedQuery();
    state.data = [remoteRow('a', '101', T3, true), remoteRow('x', '150', T3, true)];

    await table.sync();

    expect(await table.get('a')).toBeNull();
    expect(await table.get('x')).toBeNull();
    expect(await table.get('b')).toMatchObject({ armbandNumber: '102' });
  });

  it('does not clobber a local armband with unsent work when the server shows it released', async () => {
    // Surfacing on, as in production: a released row must not be reconciled
    // into the unsent assignment (the dirty write captured its clean base).
    configureConflictSurfacing(true);
    try {
      const { state } = await primedQuery();
      const local = (await table.get('a'))!;
      await table.set('a', { ...local, armbandNumber: '999', _syncStatus: 'pending' }, true);
      state.data = [remoteRow('a', '101', T3, true)];

      await table.sync();

      const row = await table.getReplicatedRow('a');
      expect(row?.data).toMatchObject({ armbandNumber: '999', dogId: 'dog-a', isAvailable: false });
      expect(row?.isDirty).toBe(true);
      expect(row?.data._syncStatus).not.toBe('conflict');
    } finally {
      configureConflictSurfacing(false);
    }
  });

  it('keeps a pending local create even when the delta names its id as released', async () => {
    const { state } = await primedQuery();
    await table.set(
      'local-new',
      {
        id: 'local-new',
        showId: 'show-1',
        dogId: 'dog-9',
        armbandNumber: '300',
        isAvailable: false,
        _localOnly: true,
        _syncStatus: 'pending',
      },
      true
    );
    state.data = [remoteRow('local-new', '300', T3, true)];

    await table.sync();

    expect(await table.get('local-new')).toMatchObject({ armbandNumber: '300', _localOnly: true });
  });

  it('keeps a pending local create through a counted full sync', async () => {
    configureRemoteCountCadence({ everyPass: true });
    const { state } = await primedQuery();
    await table.set(
      'local-new',
      {
        id: 'local-new',
        showId: 'show-1',
        dogId: 'dog-9',
        armbandNumber: '300',
        isAvailable: false,
        _localOnly: true,
        _syncStatus: 'pending',
      },
      true
    );
    state.data = [remoteRow('a', '101', T1)];
    state.count = 1;

    const result = await table.sync();

    expect(result.operation).toBe('full-sync');
    expect(await table.get('b')).toBeNull();
    expect(await table.get('local-new')).toMatchObject({ armbandNumber: '300' });
  });

  it('keeps a clean local copy held at a newer server version than the tombstone', async () => {
    const { state } = await primedQuery();
    const local = (await table.get('a'))!;
    await table.batchSet([local], new Map([['a', 5]]));
    state.data = [{ ...remoteRow('a', '101', T3, true), version: 3 }];

    await table.sync();

    expect(await table.get('a')).toMatchObject({
      armbandNumber: '101',
      dogId: 'dog-a',
      isAvailable: false,
    });
  });

  it("covers every show in one pass: a second show's change arrives without a show filter", async () => {
    const { query, state } = await primedQuery();
    state.data = [remoteRow('z', '501', T3, false, 'show-2')];

    await table.sync();

    expect(query.eq).not.toHaveBeenCalledWith('show_id', expect.anything());
    expect(await table.getByShow('show-2')).toEqual([
      expect.objectContaining({ id: 'z', armbandNumber: '501' }),
    ]);
    expect(await table.getByShow('show-1')).toHaveLength(2);
  });

  it('advances the watermark to the newest server updated_at, not the client clock', async () => {
    await primedQuery();

    const metadata = await table.getSyncMetadata();

    expect(metadata?.lastIncrementalSyncAt).toBe(Date.parse(T2));
  });

  // PostgREST returns microsecond timestamps with an offset, not `Z`.
  const PG_T1 = '2026-10-21T10:00:00.123456+00:00';
  const PG_T4 = '2026-10-21T10:20:00.654321+00:00';
  const page = (prefix: string, updatedAt: string) =>
    Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) =>
      remoteRow(`${prefix}${String(i).padStart(4, '0')}`, `${prefix}${i}`, updatedAt)
    );
  const lastId = (prefix: string) => `${prefix}${String(POSTGREST_MAX_ROWS - 1).padStart(4, '0')}`;

  it('pages a full sync past max_rows, keeping the assigned-only filter on every page', async () => {
    const { supabase } = await import('@/services/database/supabaseClient');
    const { state } = mockQuery(vi.mocked(supabase.from));
    state.pages = [page('r', PG_T1), [remoteRow('zz-last', '9999', PG_T4, false, 'show-2')]];
    state.count = POSTGREST_MAX_ROWS + 1;

    expect((await table.sync()).success).toBe(true);

    expect(state.rowReads).toHaveLength(2);
    expect(state.rowReads[0]).toContain('eq("is_available",false)');
    expect(state.rowReads[0]!.some(call => call.startsWith('or('))).toBe(false);
    expect(state.rowReads[1]).toContain('eq("is_available",false)');
    expect(state.rowReads[1]).toContain(
      `or(${JSON.stringify(`updated_at.gt.${PG_T1},and(updated_at.eq.${PG_T1},id.gt.${lastId('r')})`)})`
    );
    expect(await table.get('zz-last')).toMatchObject({ armbandNumber: '9999' });
    expect(await table.getByShow('show-1')).toHaveLength(POSTGREST_MAX_ROWS);
    // Only the first page lifts the watermark: a release committed while later
    // pages were read is still after it, so the next delta sees the tombstone.
    expect((await table.getSyncMetadata())?.lastIncrementalSyncAt).toBe(parseUpdatedAtMs(PG_T1));
  });

  it('keeps only the newest copy of a row that moved to a later page mid-delta', async () => {
    const { state } = await primedQuery();
    const firstPage = page('d', PG_T1);
    firstPage[0] = remoteRow('a', '101', PG_T1);
    state.pages = [firstPage, [{ ...remoteRow('a', '101', PG_T4, true), version: 2 }]];

    await table.sync();

    expect(await table.get('a')).toBeNull();
  });

  it('pages a delta: the cursor follows the watermark read, with no assigned-only filter', async () => {
    const { state } = await primedQuery();
    state.rowReads = [];
    state.pages = [page('d', PG_T4), [remoteRow('d-last', '8888', PG_T4)]];

    expect((await table.sync()).operation).toBe('incremental-sync');

    expect(state.rowReads).toHaveLength(2);
    expect(state.rowReads[0]).toContain(
      `gt("updated_at",${JSON.stringify(new Date(Date.parse(T2) - REPLICATION_INCREMENTAL_BUFFER_MS).toISOString())})`
    );
    expect(state.rowReads[1]).toContain(
      `or(${JSON.stringify(`updated_at.gt.${PG_T4},and(updated_at.eq.${PG_T4},id.gt.${lastId('d')})`)})`
    );
    expect(state.rowReads.flat()).not.toContain('eq("is_available",false)');
    expect(await table.get('d-last')).toMatchObject({ armbandNumber: '8888' });
  });

  it('a server count below the local count forces a full sync that removes the missing row', async () => {
    configureRemoteCountCadence({ everyPass: true });
    const { query, state } = await primedQuery();
    state.data = [remoteRow('a', '101', T1)];
    state.count = 1;

    const result = await table.sync();

    expect(result.operation).toBe('full-sync');
    expect(query.eq).toHaveBeenCalledWith('is_available', false);
    expect(await table.get('b')).toBeNull();
    expect(await table.get('a')).toMatchObject({ armbandNumber: '101' });
  });
});
