/**
 * MYK9-2252: the waitlist adapter pages. One request returns at most max_rows
 * (1,000) rows, the oldest by updated_at; an unpaged fetch never reached the rest.
 */
import { createDatabaseError } from '@/services/database/databaseError';
import { configureRemoteCountCadence } from '@myk9/replication';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFakePostgrestTable } from '@/test/utils/fakePostgrestTable';

const server = vi.hoisted(() => ({ table: null as unknown as { from: () => unknown } }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: (_columns: string, options?: { head?: boolean }) =>
        options?.head
          ? Promise.resolve({ count: serverRows().length, error: null })
          : server.table.from(),
    }),
    rpc: vi.fn(),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

const serverRows = () => rowsHolder.rows;
const rowsHolder = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { replicatedWaitlistEntriesTable } from '../ReplicatedWaitlistEntriesTable';
import { signInReplicatedTable } from '@/test/utils/signedInReplication';

const T0 = Date.parse('2026-09-01T12:00:00.000Z');

const waitlistRow = (index: number, updatedAt: string) => ({
  id: `entry-${String(index).padStart(5, '0')}`,
  class_id: 'class-a',
  dog_id: `dog-${index}`,
  exhibitor_id: `exhibitor-${index}`,
  handler_id: null,
  position: index + 1,
  status: 'waiting',
  joined_via: 'online',
  offered_at: null,
  offer_expires_at: null,
  created_at: updatedAt,
  updated_at: updatedAt,
});

describe('ReplicatedWaitlistEntriesTable paging (MYK9-2252)', () => {
  beforeEach(async () => {
    configureRemoteCountCadence({ everyPass: true });
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    signInReplicatedTable(replicatedWaitlistEntriesTable);
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.restoreAllMocks();
  });

  it('syncs more than 1,000 rows, including ones sharing one updated_at', async () => {
    // 1,500 rows in one instant: a page boundary falls inside the tie.
    rowsHolder.rows = Array.from({ length: 1500 }, (_, i) =>
      waitlistRow(i, new Date(T0).toISOString())
    );
    server.table = createFakePostgrestTable(rowsHolder.rows);

    const result = await replicatedWaitlistEntriesTable.sync();

    expect(result.success).toBe(true);
    const stored = await replicatedWaitlistEntriesTable.getAll();
    expect(stored).toHaveLength(1500);
    expect(new Set(stored.map(entry => entry.id)).size).toBe(1500);
  });
});
