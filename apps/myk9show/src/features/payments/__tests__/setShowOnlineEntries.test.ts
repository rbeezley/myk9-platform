/**
 * MYK9-979 (Codex round 4 on #2707): the switch is an online-only server
 * action. It calls set_show_online_entries with exactly its two arguments,
 * never queues a replicated mutation, and refreshes the local replica row
 * from the server afterwards.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setShowOnlineEntries } from '../setShowOnlineEntries';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  row: { id: 'show-1', name: 'Fall Trial', version: 7, online_entries_enabled: true } as Record<
    string,
    unknown
  > | null,
  unsynced: false,
  table: {
    replaceFromRemote: vi.fn(async () => {}),
    hasUnsyncedLocalWork: vi.fn(async () => false),
    updateShow: vi.fn(),
    queueMutation: vi.fn(),
  },
}));

vi.mock('@/services/database/supabaseClient', () => {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: async () => ({ data: h.row, error: null }),
  };
  return { supabase: { rpc: h.rpc, from: () => query } };
});
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: h.table,
  rowToShow: (row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    onlineEntriesEnabled: row.online_entries_enabled,
  }),
}));

describe('setShowOnlineEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockResolvedValue({ data: null, error: null });
    h.table.hasUnsyncedLocalWork.mockResolvedValue(false);
  });

  it('calls the RPC with exactly the show id and the value', async () => {
    await setShowOnlineEntries('show-1', true);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('set_show_online_entries', {
      p_show_id: 'show-1',
      p_enabled: true,
    });
  });

  it('creates no replicated mutation', async () => {
    await setShowOnlineEntries('show-1', false);
    expect(h.table.updateShow).not.toHaveBeenCalled();
    expect(h.table.queueMutation).not.toHaveBeenCalled();
  });

  it('refreshes the local replica row from the server, with its server version', async () => {
    await setShowOnlineEntries('show-1', true);
    expect(h.table.replaceFromRemote).toHaveBeenCalledWith(
      'show-1',
      expect.objectContaining({ id: 'show-1', onlineEntriesEnabled: true }),
      7
    );
  });

  it('leaves a row with unconfirmed local work to the next sync', async () => {
    h.table.hasUnsyncedLocalWork.mockResolvedValue(true);
    await setShowOnlineEntries('show-1', true);
    expect(h.table.replaceFromRemote).not.toHaveBeenCalled();
  });

  it('throws the server refusal (e.g. MK003) and refreshes nothing', async () => {
    const refusal = { code: 'MK003', message: 'Connect your club…' };
    h.rpc.mockResolvedValue({ data: null, error: refusal });
    await expect(setShowOnlineEntries('show-1', true)).rejects.toBe(refusal);
    expect(h.table.replaceFromRemote).not.toHaveBeenCalled();
  });
});
