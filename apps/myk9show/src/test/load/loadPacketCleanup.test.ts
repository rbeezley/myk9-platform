import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { clearLoadTrialPacketSnapshots } from './loadPacketCleanup';

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';

function createClient(options?: { storageError?: string }) {
  const selectEq = vi.fn().mockResolvedValue({
    data: [
      { storage_path: `${SHOW_ID}/packet-a.pdf` },
      { storage_path: `${SHOW_ID}/packet-a.pdf` },
      { storage_path: `${SHOW_ID}/packet-b.pdf` },
    ],
    error: null,
  });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({
    data: null,
    error: options?.storageError ? { message: options.storageError } : null,
  });
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ eq: selectEq }),
    delete: vi.fn().mockReturnValue({ eq: deleteEq }),
  });
  const storageFrom = vi.fn().mockReturnValue({ remove });
  const client = {
    from,
    storage: { from: storageFrom },
  } as unknown as SupabaseClient;

  return { client, deleteEq, remove, storageFrom };
}

describe('load trial packet cleanup', () => {
  it('removes each immutable object before deleting its audit rows', async () => {
    const { client, deleteEq, remove, storageFrom } = createClient();

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID)).resolves.toEqual({
      objectsRemoved: 2,
      rowsRemoved: 3,
    });
    expect(storageFrom).toHaveBeenCalledWith('trial-packets');
    expect(remove).toHaveBeenCalledWith([
      `${SHOW_ID}/packet-a.pdf`,
      `${SHOW_ID}/packet-b.pdf`,
    ]);
    expect(deleteEq).toHaveBeenCalledWith('show_id', SHOW_ID);
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(deleteEq.mock.invocationCallOrder[0]!);
  });

  it('preserves audit rows when storage deletion fails', async () => {
    const { client, deleteEq } = createClient({ storageError: 'storage unavailable' });

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID)).rejects.toThrow(
      'storage unavailable'
    );
    expect(deleteEq).not.toHaveBeenCalled();
  });
});
