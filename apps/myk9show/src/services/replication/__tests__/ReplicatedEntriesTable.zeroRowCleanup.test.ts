/**
 * MYK9-880: the entries coverage count and the row fetch read the same
 * RLS-filtered view, so an RLS gap reads as a complete empty fetch. The entries
 * sync gives the engine an independent proof of an empty show: the
 * manager-authorized SECURITY DEFINER count. Anything but a confirmed zero
 * (non-manager, offline, error) must read as "not proven".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncReplicatedTableAdapter } from '@myk9/replication';

const engine = vi.hoisted(() => ({ adapters: [] as unknown[], rpc: vi.fn() }));

vi.mock('@myk9/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@myk9/replication')>();
  return {
    ...actual,
    syncReplicatedTable: vi.fn(async (_table: unknown, adapter: unknown) => {
      engine.adapters.push(adapter);
      return { tableName: 'entries', success: true, operation: 'incremental-sync' };
    }),
  };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: engine.rpc },
}));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { ReplicatedEntriesTable, type ReplicatedEntry } from '../ReplicatedEntriesTable';

describe('ReplicatedEntriesTable zero-row stale cleanup proof (MYK9-880)', () => {
  let adapter: SyncReplicatedTableAdapter<unknown, ReplicatedEntry>;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    engine.adapters.length = 0;
    engine.rpc.mockReset();
    await new ReplicatedEntriesTable().sync('show-1');
    adapter = engine.adapters[0] as SyncReplicatedTableAdapter<unknown, ReplicatedEntry>;
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('proves an empty show only from the independent live-entry count reading zero', async () => {
    engine.rpc.mockResolvedValue({ data: 0, error: null });

    await expect(adapter.verifyScopeEmpty?.({ scope: { value: 'show-1' } })).resolves.toBe(true);
    expect(engine.rpc).toHaveBeenCalledWith('get_secretary_live_entry_count', {
      p_show_id: 'show-1',
    });
  });

  it('does not prove an empty show when the independent count is non-zero', async () => {
    engine.rpc.mockResolvedValue({ data: 14, error: null });

    await expect(adapter.verifyScopeEmpty?.({ scope: { value: 'show-1' } })).resolves.toBe(false);
  });

  it('does not prove an empty show for a caller the RPC refuses', async () => {
    engine.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Not authorized' },
    });

    await expect(adapter.verifyScopeEmpty?.({ scope: { value: 'show-1' } })).resolves.toBe(false);
  });
});
