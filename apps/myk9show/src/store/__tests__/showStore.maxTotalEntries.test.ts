import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockShowsTable } = vi.hoisted(() => ({
  mockShowsTable: {
    getAllWithStatus: vi.fn(),
    subscribe: vi.fn(),
    updateShow: vi.fn(),
  },
}));

vi.mock('@/services/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication')>()),
  replicatedShowsTable: mockShowsTable,
}));
vi.mock('@/config/dataSource', () => ({ shouldUseMockData: () => false }));

import { replicatedToShow, useShowStore } from '../showStore';
import type { StoreShow } from '@/types/show-types';

// MYK9-2220: Edit show's "Max total entries" reached the premium but never the show row, so
// Regenerate (which reads shows.max_total_entries) reversed the edit.
describe('showStore.updateShow max total entries (MYK9-2220)', () => {
  beforeEach(() => {
    mockShowsTable.updateShow.mockReset().mockResolvedValue('mutation-1');
    useShowStore.setState({
      shows: [{ id: 'show-1', name: 'Heartland Classic', maxTotalEntries: 80 } as StoreShow],
      error: null,
      isLoading: false,
    });
  });

  it('writes a new limit to the replicated show row', async () => {
    await useShowStore.getState().updateShow('show-1', { maxTotalEntries: 120 });
    expect(mockShowsTable.updateShow).toHaveBeenCalledWith(
      'show-1',
      expect.objectContaining({ maxTotalEntries: 120 })
    );
    expect(useShowStore.getState().shows[0]?.maxTotalEntries).toBe(120);
  });

  it('clears the limit when the form sends an empty value', async () => {
    await useShowStore.getState().updateShow('show-1', { maxTotalEntries: undefined });
    const [, sent] = mockShowsTable.updateShow.mock.calls[0] ?? [];
    expect(sent).toHaveProperty('maxTotalEntries', undefined);
    expect(useShowStore.getState().shows[0]?.maxTotalEntries).toBeUndefined();
  });

  it('leaves the limit alone when the edit does not mention it', async () => {
    await useShowStore.getState().updateShow('show-1', { name: 'Renamed' });
    const [, sent] = mockShowsTable.updateShow.mock.calls[0] ?? [];
    expect(sent).not.toHaveProperty('maxTotalEntries');
    expect(useShowStore.getState().shows[0]?.maxTotalEntries).toBe(80);
  });

  it('keeps the saved cap when the show is rebuilt from the replica (offline reload)', () => {
    const fromReplica = replicatedToShow({
      id: 'show-1',
      name: 'Heartland Classic',
      maxTotalEntries: 120,
    } as Parameters<typeof replicatedToShow>[0]);
    expect(fromReplica.maxTotalEntries).toBe(120);

    const noCap = replicatedToShow({ id: 'show-1', name: 'Heartland Classic' } as Parameters<
      typeof replicatedToShow
    >[0]);
    expect(noCap.maxTotalEntries).toBeUndefined();
  });
});
