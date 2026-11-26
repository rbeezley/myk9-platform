/**
 * MYK9-2252: the clubs adapter pages its download, and its visibility reconcile
 * reads every visible id, past PostgREST's max_rows and past a hosted max_rows
 * below the page size.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFakePostgrestTable } from '@/test/utils/fakePostgrestTable';

const server = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  table: null as unknown as { from: () => unknown; requests: string[] },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'secretary-1' } } } }),
    },
    from: () => ({
      select: (columns: string, options?: { head?: boolean }) => {
        if (!options?.head) return (server.table.from() as { select: () => unknown }).select();
        const answer = { count: server.rows.length, error: null };
        const head: Record<string, unknown> = {
          is: () => head,
          abortSignal: () => head,
          then: (resolve: (value: unknown) => unknown) => resolve(answer),
        };
        void columns;
        return head;
      },
    }),
  },
}));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { ReplicatedClubsTable } from '../ReplicatedClubsTable';
import { resetIdScanCadence } from '../idScanCadence';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const pad = (index: number) => String(index).padStart(5, '0');

function serve(count: number, maxRows: number) {
  const sameInstant = '2026-05-05T10:00:00.000Z';
  server.rows = Array.from({ length: count }, (_, i) => ({
    id: `club-${pad(i)}`,
    name: `Club ${i}`,
    club_type: 'kennel_club',
    status: 'active',
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    // Rows from 400 on share one timestamp, straddling the page boundaries.
    updated_at: i < 400 ? new Date(T0 + i * 1000).toISOString() : sameInstant,
  }));
  server.table = createFakePostgrestTable(server.rows, maxRows);
}

describe('ReplicatedClubsTable paging (MYK9-2252)', () => {
  beforeEach(async () => {
    resetIdScanCadence();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('syncs more than 1,000 clubs, including rows that share one updated_at', async () => {
    serve(2300, 1000);
    const table = new ReplicatedClubsTable();

    const result = await table.sync();

    expect(result.success).toBe(true);
    const stored = await table.getAll();
    expect(stored).toHaveLength(2300);
    expect(new Set(stored.map(row => row.id)).size).toBe(2300);
  });

  it('syncs every club when the server caps a response below the page size', async () => {
    serve(1300, 500);
    const table = new ReplicatedClubsTable();

    const result = await table.sync();

    expect(result.success).toBe(true);
    expect(await table.getAll()).toHaveLength(1300);
  });

  it('prunes a club the server no longer shows, even when the visible set is past one page', async () => {
    serve(1300, 500);
    const table = new ReplicatedClubsTable();
    await table.sync();
    server.rows.splice(1250, 1);
    server.table = createFakePostgrestTable(server.rows, 500);

    const removed = await table.reconcileVisibility();

    expect(removed).toBe(1);
    expect(await table.getAll()).toHaveLength(1299);
  });

  it('prunes nothing when the server ignores the id cursor and the ids read fall short of the count', async () => {
    serve(1300, 500);
    const table = new ReplicatedClubsTable();
    await table.sync();
    server.rows.splice(1250, 1);
    const real = createFakePostgrestTable(server.rows, 500);
    server.table = {
      requests: real.requests,
      from: () => {
        const builder = real.from();
        builder.gt = () => builder;
        return builder;
      },
    };

    const removed = await table.reconcileVisibility();

    // One page, then the same page again: the read stops at 500 of 1,299 and prunes nothing.
    expect(removed).toBe(0);
    expect(await table.getAll()).toHaveLength(1300);
    expect(real.requests).toHaveLength(2);
  });
});
