import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  acknowledgeServerDeletion: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
  logQuery: vi.fn(),
  createDatabaseError,
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { acknowledgeServerDeletion: mocks.acknowledgeServerDeletion },
}));

import { deleteEntry } from './writes';

describe('secretary soft-delete cache coherence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: 5, error: null });
    mocks.acknowledgeServerDeletion.mockResolvedValue(undefined);
  });

  it('removes through soft_delete_entry, never a direct deleted_at write', async () => {
    await deleteEntry('removed-entry', 'secretary-1');
    expect(mocks.rpc).toHaveBeenCalledWith('soft_delete_entry', { p_entry_id: 'removed-entry' });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('evicts the warm show replica with the version the RPC returns', async () => {
    const result = await deleteEntry('removed-entry', 'secretary-1');
    expect(mocks.acknowledgeServerDeletion).toHaveBeenCalledWith('removed-entry', 5);
    expect(result.error).toBeNull();
  });

  it('keeps the local row when the server rejects removal', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('denied') });
    const result = await deleteEntry('live-entry', 'secretary-1');
    expect(mocks.acknowledgeServerDeletion).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('surfaces the money guard refusal to the caller', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'MK010', message: 'This entry has been paid for or scored.' },
    });
    const result = await deleteEntry('paid-entry');
    expect(result.error).toBeTruthy();
    expect(mocks.acknowledgeServerDeletion).not.toHaveBeenCalled();
  });
});
