import { beforeEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock('@myk9/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@myk9/replication')>();
  return {
    ...actual,
    syncReplicatedTable: vi.fn(async (_table: unknown, adapter: unknown) => {
      engine.calls.push(adapter);
      return { tableName: 'paperwork_prints', success: true, operation: 'full-sync' };
    }),
  };
});
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const db = vi.hoisted(() => ({
  pages: [] as unknown[][],
  log: [] as string[],
  signals: [] as AbortSignal[],
  afterRange: undefined as (() => void) | undefined,
}));

vi.mock('@/services/database/supabaseClient', () => {
  const query = {
    select: () => query,
    eq: (column: string, value: string) => {
      db.log.push(`eq:${column}=${value}`);
      return query;
    },
    gt: () => {
      db.log.push('gt');
      return query;
    },
    or: (filter: string) => {
      db.log.push(`or:${filter}`);
      return query;
    },
    order: () => query,
    abortSignal: (signal: AbortSignal) => {
      db.signals.push(signal);
      return query;
    },
    range: async () => {
      const data = db.pages.shift() ?? [];
      db.afterRange?.();
      return { data, error: null };
    },
  };
  return { supabase: { from: () => query } };
});

import { ReplicatedPaperworkPrintsTable } from '../ReplicatedPaperworkPrintsTable';

type Adapter = {
  fetchRemoteRows: (args: {
    since: number;
    forceFullSync: boolean;
    signal?: AbortSignal;
  }) => Promise<unknown[]>;
};

// Module-scope state: reset before every test so a shuffled order cannot leak pages.
beforeEach(() => {
  engine.calls.length = 0;
  db.pages = [];
  db.log = [];
  db.signals = [];
  db.afterRange = undefined;
});

// MYK9-2420: the print-history fetch was one unpaged request with no abort signal.
describe('ReplicatedPaperworkPrintsTable fetch', () => {
  const row = (i: number) => ({ id: `pp-${i}`, updated_at: '2026-09-25T00:00:00Z' });

  async function adapterFor(showId: string): Promise<Adapter> {
    await new ReplicatedPaperworkPrintsTable().sync(showId);
    return engine.calls[0] as Adapter;
  }

  it('pages by (updated_at, id) until an empty page, scoped to the show', async () => {
    db.pages = [[row(1)], [row(2)]];
    const adapter = await adapterFor('show-1');

    const rows = await adapter.fetchRemoteRows({ since: 0, forceFullSync: false });

    expect(rows).toHaveLength(2);
    expect(db.log).toEqual([
      'gt',
      'eq:show_id=show-1',
      'or:updated_at.gt.2026-09-25T00:00:00Z,and(updated_at.eq.2026-09-25T00:00:00Z,id.gt.pp-1)',
      'eq:show_id=show-1',
      'or:updated_at.gt.2026-09-25T00:00:00Z,and(updated_at.eq.2026-09-25T00:00:00Z,id.gt.pp-2)',
      'eq:show_id=show-1',
    ]);
  });

  it('hands the sync signal to every page request, including the terminal empty page', async () => {
    db.pages = [[row(1)]];
    const adapter = await adapterFor('show-1');
    const controller = new AbortController();

    await adapter.fetchRemoteRows({ since: 0, forceFullSync: false, signal: controller.signal });

    // One page, then the empty page that ends the read.
    expect(db.signals).toHaveLength(2);
    expect(db.signals.every(signal => signal === controller.signal)).toBe(true);
  });

  it('never requests page two once the signal aborts after page one', async () => {
    db.pages = [[row(1)], [row(2)]];
    const adapter = await adapterFor('show-1');
    const controller = new AbortController();
    db.afterRange = () => controller.abort();

    await expect(
      adapter.fetchRemoteRows({ since: 0, forceFullSync: false, signal: controller.signal })
    ).rejects.toThrow();

    expect(db.signals).toHaveLength(1);
  });
});
