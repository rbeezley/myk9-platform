import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MutationManager } from '@myk9/replication';
import { fromAny } from '@total-typescript/shoehorn';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { ReplicatedShowsTable } from '../ReplicatedShowsTable';

const manager = (pending: Array<{ operation: string }>) => {
  const m = {
    rowRefetchers: { register: vi.fn() },
    getPendingMutationsForRow: vi.fn().mockResolvedValue(pending),
    discardPendingMutationsForRow: vi.fn().mockResolvedValue(undefined),
  };
  return m;
};

describe('ReplicatedShowsTable.discardPendingLocalCreate', () => {
  let table: ReplicatedShowsTable;

  beforeEach(() => {
    table = new ReplicatedShowsTable();
  });

  it('discards every queued mutation for the show when its INSERT is still queued', async () => {
    const m = manager([{ operation: 'INSERT' }, { operation: 'UPDATE' }]);
    table.setMutationManager(fromAny<MutationManager, unknown>(m));

    await expect(table.discardPendingLocalCreate('s1')).resolves.toBe(true);

    expect(m.getPendingMutationsForRow).toHaveBeenCalledWith('shows', 's1');
    expect(m.discardPendingMutationsForRow).toHaveBeenCalledWith('shows', 's1');
  });

  it('leaves the queue alone when no INSERT is queued (the show is on the server)', async () => {
    const m = manager([{ operation: 'UPDATE' }]);
    table.setMutationManager(fromAny<MutationManager, unknown>(m));

    await expect(table.discardPendingLocalCreate('s1')).resolves.toBe(false);

    expect(m.discardPendingMutationsForRow).not.toHaveBeenCalled();
  });

  it('is false with no mutation manager attached', async () => {
    await expect(table.discardPendingLocalCreate('s1')).resolves.toBe(false);
  });
});
