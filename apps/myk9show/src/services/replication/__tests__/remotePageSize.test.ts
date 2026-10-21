/**
 * MYK9-1301: an unpaginated adapter returns at most PostgREST's max_rows per
 * pass, so it must declare that as its page size or a capped delta never makes
 * the next pass count. Each table's real adapter is captured at the engine call.
 */
import { describe, expect, it, vi } from 'vitest';
import { POSTGREST_MAX_ROWS } from '../postgrestMaxRows';

const captured = vi.hoisted(() => ({ adapters: [] as Array<{ remotePageSize?: number }> }));

vi.mock('@myk9/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/replication')>()),
  syncReplicatedTable: vi.fn(async (_table: unknown, adapter: { remotePageSize?: number }) => {
    captured.adapters.push(adapter);
    return { tableName: 't', success: true, operation: 'incremental-sync', rowsAffected: 0 };
  }),
}));

import { replicatedClassesTable } from '../ReplicatedClassesTable';
import { replicatedTrialsTable } from '../ReplicatedTrialsTable';
import { replicatedShowsTable } from '../ReplicatedShowsTable';
import { replicatedWaitlistEntriesTable } from '../ReplicatedWaitlistEntriesTable';

describe('remotePageSize on unpaginated adapters (MYK9-1301)', () => {
  it.each([
    ['classes', replicatedClassesTable],
    ['trials', replicatedTrialsTable],
    ['shows', replicatedShowsTable],
    ['waitlist_entries', replicatedWaitlistEntriesTable],
  ] as const)('%s declares PostgREST max_rows as its page size', async (_name, table) => {
    captured.adapters.length = 0;
    await table.sync('scope-1');
    expect(captured.adapters).toHaveLength(1);
    expect(captured.adapters[0]?.remotePageSize).toBe(POSTGREST_MAX_ROWS);
  });
});
