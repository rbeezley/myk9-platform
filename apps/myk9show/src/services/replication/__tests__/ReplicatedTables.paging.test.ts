/**
 * MYK9-2252: classes, trials and shows sync past PostgREST's max_rows. The fake
 * server caps every response at 1,000 rows, as the real one does, so an unpaged
 * adapter gets the oldest 1,000 and never the rest.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFakePostgrestTable } from '@/test/utils/fakePostgrestTable';

const server = vi.hoisted(() => ({
  tables: {} as Record<string, { from: () => unknown }>,
  rows: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: (_columns: string, options?: { head?: boolean }) =>
        options?.head
          ? {
              eq: () => Promise.resolve({ count: server.rows[table]?.length ?? 0, error: null }),
              is: () => ({
                eq: () => Promise.resolve({ count: server.rows[table]?.length ?? 0, error: null }),
                then: (resolve: (value: unknown) => unknown) =>
                  Promise.resolve({ count: server.rows[table]?.length ?? 0, error: null }).then(
                    resolve
                  ),
              }),
              then: (resolve: (value: unknown) => unknown) =>
                Promise.resolve({ count: server.rows[table]?.length ?? 0, error: null }).then(
                  resolve
                ),
            }
          : server.tables[table]?.from(),
    }),
  },
  logQuery: vi.fn(),
}));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../resolveClassHideCounts', () => ({
  resolveHideCountsForClassRows: vi.fn(async () => new Map()),
}));

import { ReplicatedClassesTable } from '../ReplicatedClassesTable';
import { ReplicatedTrialsTable } from '../ReplicatedTrialsTable';
import { ReplicatedShowsTable } from '../ReplicatedShowsTable';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const COUNT = 1600;
const pad = (index: number) => String(index).padStart(5, '0');
const stamp = (index: number) => new Date(T0 + index * 1000).toISOString();

function serve(table: string, rows: Array<Record<string, unknown>>) {
  server.rows[table] = rows;
  server.tables[table] = createFakePostgrestTable(rows);
}

describe('replicated table paging (MYK9-2252)', () => {
  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('classes: syncs more than 1,000 rows, including ones cloned in one instant', async () => {
    const sameInstant = '2026-05-05T10:00:00.000Z';
    serve(
      'classes',
      Array.from({ length: COUNT }, (_, i) => ({
        id: `class-${pad(i)}`,
        trial_id: 'trial-1',
        name: `Class ${i}`,
        entry_fee: 25,
        // Half share one timestamp, straddling the 1,000-row page boundary.
        updated_at: i < 400 ? stamp(i) : sameInstant,
        judge_assignments: [],
      }))
    );
    const table = new ReplicatedClassesTable();

    const result = await table.sync('trial-1');

    expect(result.success).toBe(true);
    const stored = await table.getAll();
    expect(stored).toHaveLength(COUNT);
    expect(new Set(stored.map(row => row.id)).size).toBe(COUNT);
  });

  it('trials: syncs more than 1,000 rows', async () => {
    serve(
      'trials',
      Array.from({ length: COUNT }, (_, i) => ({
        id: `trial-${pad(i)}`,
        show_id: 'show-1',
        name: `Trial ${i}`,
        date: '2026-10-10',
        deleted_at: null,
        updated_at: stamp(i),
        version: 1,
      }))
    );
    const table = new ReplicatedTrialsTable();

    const result = await table.sync('show-1');

    expect(result.success).toBe(true);
    expect(await table.getAll()).toHaveLength(COUNT);
  });

  it('shows: syncs more than 1,000 rows', async () => {
    serve(
      'shows',
      Array.from({ length: COUNT }, (_, i) => ({
        id: `show-${pad(i)}`,
        name: `Show ${i}`,
        organization: 'AKC',
        start_date: '2026-10-01',
        end_date: '2026-10-02',
        location: 'Fairgrounds',
        status: 'published',
        club_id: 'club-1',
        updated_at: stamp(i),
        deleted_at: null,
      }))
    );
    const table = new ReplicatedShowsTable();

    const result = await table.sync('');

    expect(result.success).toBe(true);
    expect(await table.getAll()).toHaveLength(COUNT);
  });
});
