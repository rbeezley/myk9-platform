/**
 * MYK9-979 (Codex rounds 4-5 on #2707): the switch is an online-only server
 * action. It calls set_show_online_entries with exactly its two arguments and
 * never writes the local replica: no queued mutation, no replaceFromRemote.
 * The incremental show sync brings the bumped row through its own merge.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setShowOnlineEntries } from '../setShowOnlineEntries';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  table: {
    replaceFromRemote: vi.fn(async () => {}),
    updateShow: vi.fn(async () => null),
    set: vi.fn(async () => {}),
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: h.rpc, from: h.from },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: h.table,
}));

describe('setShowOnlineEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('calls the RPC with exactly the show id and the value', async () => {
    await setShowOnlineEntries('show-1', true);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('set_show_online_entries', {
      p_show_id: 'show-1',
      p_enabled: true,
    });
  });

  it('never writes the local replica or queues a mutation on success', async () => {
    await setShowOnlineEntries('show-1', false);
    expect(h.table.replaceFromRemote).not.toHaveBeenCalled();
    expect(h.table.updateShow).not.toHaveBeenCalled();
    expect(h.table.set).not.toHaveBeenCalled();
    expect(h.from).not.toHaveBeenCalled();
  });

  it('throws the server refusal (e.g. MK003)', async () => {
    const refusal = { code: 'MK003', message: 'Connect your club…' };
    h.rpc.mockResolvedValue({ data: null, error: refusal });
    await expect(setShowOnlineEntries('show-1', true)).rejects.toBe(refusal);
  });
});
