/**
 * Dogs replica paging (MYK9-1321): a staff account reads every dog, so the
 * fetch pages past PostgREST's max_rows instead of stopping at the first page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedDogsTable } from '../ReplicatedDogsTable';
import { fetchChangedDogs } from '../dogsServer';
import { POSTGREST_MAX_ROWS } from '../postgrestMaxRows';
import { resetIdScanCadence } from '../idScanCadence';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { supabase } from '@/services/database/supabaseClient';

interface ServerDog {
  id: string;
  name: string;
  breed: string;
  owner_id: string;
  updated_at: string;
}

const TOTAL = POSTGREST_MAX_ROWS * 2 + 5;

function makeDogs(count: number, spreadMs = 0): ServerDog[] {
  // By default every dog shares one timestamp, so the id tiebreak of the keyset is exercised.
  return Array.from({ length: count }, (_, i) => ({
    id: `dog-${String(i).padStart(5, '0')}`,
    name: `Dog ${i}`,
    breed: 'Border Collie',
    owner_id: 'owner-1',
    updated_at: new Date(Date.parse('2026-10-01T00:00:00.000Z') + i * spreadMs).toISOString(),
  }));
}

/** A PostgREST stand-in: honors gt / keyset or / eq / range and records each request. */
function installServer(dogs: ServerDog[]): { requests: Array<Record<string, unknown>> } {
  const requests: Array<Record<string, unknown>> = [];
  vi.mocked(supabase.from).mockImplementation((() => {
    const req: Record<string, unknown> = { orders: [] };
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.gt = (_col: string, value: string) => ((req.gt = value), builder);
    builder.or = (filter: string) => ((req.or = filter), builder);
    builder.eq = (col: string, value: string) => ((req.eq = [col, value]), builder);
    builder.order = (col: string, opts: { ascending: boolean }) => (
      (req.orders as unknown[]).push([col, opts.ascending]),
      builder
    );
    builder.range = (from: number, to: number) => {
      req.range = [from, to];
      requests.push(req);
      let rows = [...dogs].sort(
        (a, b) => a.updated_at.localeCompare(b.updated_at) || (a.id < b.id ? -1 : 1)
      );
      if (typeof req.gt === 'string') rows = rows.filter(d => d.updated_at > (req.gt as string));
      if (typeof req.or === 'string') {
        const match = /updated_at\.gt\.([^,]+),and\(updated_at\.eq\.[^,]+,id\.gt\.([^)]+)\)/.exec(
          req.or
        );
        expect(match, `unexpected keyset filter: ${req.or}`).not.toBeNull();
        const at = match![1]!;
        const id = match![2]!;
        rows = rows.filter(d => d.updated_at > at || (d.updated_at === at && d.id > id));
      }
      if (req.eq) rows = rows.filter(d => d.owner_id === (req.eq as string[])[1]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    };
    return builder;
  }) as unknown as typeof supabase.from);
  return { requests };
}

/** Every request orders by updated_at then id and asks for exactly one max_rows page. */
function expectPagedRequests(requests: Array<Record<string, unknown>>): void {
  for (const req of requests) {
    expect(req.orders).toEqual([
      ['updated_at', true],
      ['id', true],
    ]);
    expect(req.range).toEqual([0, POSTGREST_MAX_ROWS - 1]);
  }
}

describe('fetchChangedDogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pages past max_rows and returns every dog once', async () => {
    const server = installServer(makeDogs(TOTAL));
    const rows = await fetchChangedDogs(0);
    expect(rows).toHaveLength(TOTAL);
    expect(new Set(rows.map(r => r.id)).size).toBe(TOTAL);
    expect(server.requests).toHaveLength(3);
    expectPagedRequests(server.requests);
  });

  it('keeps the owner scope on every page', async () => {
    const server = installServer(makeDogs(POSTGREST_MAX_ROWS + 3));
    await fetchChangedDogs(0, 'owner-1');
    expect(server.requests).toHaveLength(2);
    expectPagedRequests(server.requests);
    for (const req of server.requests) expect(req.eq).toEqual(['owner_id', 'owner-1']);
  });

  it('asks again after an exactly full page and stops on the empty one', async () => {
    const server = installServer(makeDogs(POSTGREST_MAX_ROWS));
    expect(await fetchChangedDogs(0)).toHaveLength(POSTGREST_MAX_ROWS);
    expect(server.requests).toHaveLength(2);
  });

  it('returns only the newest copy of a dog that appears on two pages', async () => {
    const page1 = makeDogs(POSTGREST_MAX_ROWS);
    const edited = { ...page1[0]!, name: 'Edited', updated_at: '2026-10-02T00:00:00.000Z' };
    installServer([...page1.slice(1), edited]);
    const rows = await fetchChangedDogs(0);
    expect(rows).toHaveLength(POSTGREST_MAX_ROWS);
    expect(rows.find(r => r.id === edited.id)?.name).toBe('Edited');
  });

  it('throws on a PostgREST error', async () => {
    vi.mocked(supabase.from).mockImplementation((() => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'gt', 'or', 'eq', 'order']) b[m] = () => b;
      b.range = () => Promise.resolve({ data: null, error: { message: 'boom' } });
      return b;
    }) as unknown as typeof supabase.from);
    await expect(fetchChangedDogs(0)).rejects.toThrow('Supabase query failed: boom');
  });
});

describe('ReplicatedDogsTable sync over more than max_rows dogs', () => {
  it('holds the complete replica, and the next sync reads only the delta', async () => {
    resetIdScanCadence();
    // Two minutes apart, past the 60s incremental buffer: the watermark leaves most dogs behind.
    const dogs = makeDogs(TOTAL, 120_000);
    const server = installServer(dogs);
    const table = new ReplicatedDogsTable();
    const stored = new Map<string, unknown>();
    let lastIncrementalSyncAt = 0;
    vi.spyOn(table, 'getSyncMetadata').mockImplementation(
      async () =>
        ({
          tableName: 'dogs',
          lastFullSyncAt: stored.size > 0 ? Date.now() : 0,
          lastIncrementalSyncAt,
          totalRows: stored.size,
          syncStatus: 'idle',
        }) as never
    );
    vi.spyOn(table, 'getAllOrThrow').mockImplementation(async () => [...stored.values()] as never);
    vi.spyOn(table, 'getReplicatedRowIncludingOtherAccounts').mockResolvedValue(null);
    vi.spyOn(table, 'batchSet').mockImplementation(async rows => {
      for (const row of rows as Array<{ id: string }>) stored.set(row.id, row);
    });
    vi.spyOn(table, 'updateSyncMetadata').mockImplementation(async update => {
      if (update.lastIncrementalSyncAt) lastIncrementalSyncAt = update.lastIncrementalSyncAt;
    });
    vi.spyOn(table, 'reconcileDeleted').mockResolvedValue(0);

    const first = await table.sync('');
    expect(first.success).toBe(true);
    expect(stored.size).toBe(TOTAL);
    expect(server.requests).toHaveLength(3);

    server.requests.length = 0;
    const second = await table.sync('');
    expect(second.success).toBe(true);
    expect(stored.size).toBe(TOTAL);
    // Incremental: one short page of changes, not a full re-read.
    expect(stored.size).toBe(TOTAL);
    expect(server.requests).toHaveLength(1);
    expect(new Date(server.requests[0]!.gt as string).getTime()).toBeGreaterThan(0);
  });
});
