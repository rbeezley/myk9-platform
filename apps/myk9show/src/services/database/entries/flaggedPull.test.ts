/**
 * MYK9-1753: Clear's server write plus the read-back into the offline copy the desk shows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const h = vi.hoisted(() => ({ rpc: vi.fn(), refreshServerChangedEntries: vi.fn() }));

vi.mock('../supabaseClient', () => ({ supabase: { rpc: h.rpc }, createDatabaseError }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { refreshServerChangedEntries: h.refreshServerChangedEntries },
}));

import { clearFlaggedPull } from './flaggedPull';

describe('clearFlaggedPull', () => {
  beforeEach(() => {
    h.rpc.mockReset();
    h.refreshServerChangedEntries.mockReset();
  });

  it('asks the database to clear, reads the row back into the replica, and returns the status', async () => {
    h.rpc.mockResolvedValue({ data: 'checked-in', error: null });

    await expect(clearFlaggedPull('e1')).resolves.toBe('checked-in');
    expect(h.rpc).toHaveBeenCalledWith('clear_flagged_pull', { p_entry_id: 'e1' });
    expect(h.refreshServerChangedEntries).toHaveBeenCalledWith(['e1'], {
      insert: 'if-show-loaded',
      reason: 'flagged pull cleared by the server',
    });
  });

  it('throws on a refusal and touches nothing else', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'no longer flagged pulled' } });

    await expect(clearFlaggedPull('e1')).rejects.toMatchObject({
      message: expect.stringContaining('no longer flagged pulled'),
    });
    expect(h.refreshServerChangedEntries).not.toHaveBeenCalled();
  });
});
