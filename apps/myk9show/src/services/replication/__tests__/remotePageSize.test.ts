/**
 * MYK9-1301 / MYK9-2252: classes, trials, shows and waitlist entries page to
 * completion (keyset pager), so a full page is never a truncated answer and they
 * declare no `remotePageSize`; declaring one would make every full page force a
 * pointless count. Each table's real adapter is captured at the engine call.
 */
import { describe, expect, it, vi } from 'vitest';

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

describe('remotePageSize on adapters that page to completion (MYK9-2252)', () => {
  it.each([
    ['classes', replicatedClassesTable],
    ['trials', replicatedTrialsTable],
    ['shows', replicatedShowsTable],
    ['waitlist_entries', replicatedWaitlistEntriesTable],
  ] as const)('%s declares no page size', async (_name, table) => {
    captured.adapters.length = 0;
    await table.sync('scope-1');
    expect(captured.adapters).toHaveLength(1);
    expect(captured.adapters[0]?.remotePageSize).toBeUndefined();
  });
});
