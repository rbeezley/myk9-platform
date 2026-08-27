import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { clearLoadTrialPacketSnapshots } from './loadPacketCleanup';

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';

function createClient(options?: { storageError?: string; concurrentSnapshot?: boolean }) {
  const selectEq = vi
    .fn()
    .mockResolvedValueOnce({
      data: [
        { id: 'snapshot-a1', storage_path: `${SHOW_ID}/packet-a.pdf` },
        { id: 'snapshot-a2', storage_path: `${SHOW_ID}/packet-a.pdf` },
        { id: 'snapshot-b1', storage_path: `${SHOW_ID}/packet-b.pdf` },
      ],
      error: null,
    })
    .mockResolvedValueOnce({
      data: options?.concurrentSnapshot ? [{ id: 'snapshot-c1' }] : [],
      error: null,
    });
  const deleteIn = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({
    data: null,
    error: options?.storageError ? { message: options.storageError } : null,
  });
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ eq: selectEq }),
    delete: vi.fn().mockReturnValue({ in: deleteIn }),
  });
  const storageFrom = vi.fn().mockReturnValue({ remove });
  const client = {
    from,
    storage: { from: storageFrom },
  } as unknown as SupabaseClient;

  return { client, deleteIn, remove, storageFrom };
}

describe('load trial packet cleanup', () => {
  it('removes each immutable object before deleting its audit rows', async () => {
    const { client, deleteIn, remove, storageFrom } = createClient();

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID)).resolves.toEqual({
      objectsRemoved: 2,
      rowsRemoved: 3,
    });
    expect(storageFrom).toHaveBeenCalledWith('trial-packets');
    expect(remove).toHaveBeenCalledWith([`${SHOW_ID}/packet-a.pdf`, `${SHOW_ID}/packet-b.pdf`]);
    expect(deleteIn).toHaveBeenCalledWith('id', ['snapshot-a1', 'snapshot-a2', 'snapshot-b1']);
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(deleteIn.mock.invocationCallOrder[0]!);
  });

  it('preserves audit rows when storage deletion fails', async () => {
    const { client, deleteIn } = createClient({ storageError: 'storage unavailable' });

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID)).rejects.toThrow(
      'storage unavailable'
    );
    expect(deleteIn).not.toHaveBeenCalled();
  });

  it('fails closed when a snapshot appears during cleanup', async () => {
    const { client, deleteIn } = createClient({ concurrentSnapshot: true });

    await expect(clearLoadTrialPacketSnapshots(client, SHOW_ID)).rejects.toThrow(
      'appeared during cleanup'
    );
    expect(deleteIn).toHaveBeenCalledWith('id', ['snapshot-a1', 'snapshot-a2', 'snapshot-b1']);
  });
});
