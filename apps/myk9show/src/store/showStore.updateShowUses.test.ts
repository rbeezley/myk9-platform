import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoreShow } from '@/types/show-types';

/**
 * MYK9-1622: a "This show uses…" switch reads its value from the store. The optimistic update
 * after a save must carry the switch field; rebuilding the show from the copy read before the
 * save put the old value back over the replica's new one, and nothing re-emitted it, so the
 * switch snapped back off although the save had gone through.
 */
const mocks = vi.hoisted(() => ({ replicaUpdate: vi.fn() }));

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { updateShow: mocks.replicaUpdate, subscribe: vi.fn(() => () => {}) },
}));

import { useShowStore } from './showStore';

const show = {
  id: 'show-1',
  name: 'Fall Trial',
  usesPaperPacket: false,
  usesVolunteers: true,
} as unknown as StoreShow;

describe('showStore.updateShow: "This show uses…" switches (MYK9-1622)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.replicaUpdate.mockResolvedValue('mutation-1');
    useShowStore.setState({ shows: [show], isLoading: false, error: null });
  });

  it('keeps the new switch value in the store after the save', async () => {
    await useShowStore.getState().updateShow('show-1', { usesPaperPacket: true });

    expect(mocks.replicaUpdate).toHaveBeenCalledWith('show-1', { usesPaperPacket: true });
    expect(useShowStore.getState().shows[0]).toMatchObject({
      usesPaperPacket: true,
      usesVolunteers: true,
    });
  });

  it('does not put the old value back when the replica subscription applied it first', async () => {
    mocks.replicaUpdate.mockImplementation(async () => {
      // The replica subscription lands the saved value before the optimistic update runs.
      useShowStore.setState(state => ({
        shows: state.shows.map(s => (s.id === 'show-1' ? { ...s, usesPaperPacket: true } : s)),
      }));
      return 'mutation-1';
    });

    await useShowStore.getState().updateShow('show-1', { usesPaperPacket: true });

    expect(useShowStore.getState().shows[0]).toMatchObject({ usesPaperPacket: true });
  });
});
