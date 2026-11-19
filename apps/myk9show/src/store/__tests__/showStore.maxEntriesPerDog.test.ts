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

import { useShowStore } from '../showStore';
import type { StoreShow } from '@/types/show-types';

// MYK9-2221: Edit show's "Max entries per dog" looked saved but never reached shows.max_entries_per_dog.
describe('showStore.updateShow max entries per dog (MYK9-2221)', () => {
  beforeEach(() => {
    mockShowsTable.updateShow.mockReset().mockResolvedValue('mutation-1');
    useShowStore.setState({
      shows: [{ id: 'show-1', name: 'Heartland Classic', maxEntriesPerDog: 3 } as StoreShow],
      error: null,
      isLoading: false,
    });
  });

  it('writes a new limit to the replicated show row', async () => {
    await useShowStore.getState().updateShow('show-1', { maxEntriesPerDog: 5 });
    expect(mockShowsTable.updateShow).toHaveBeenCalledWith(
      'show-1',
      expect.objectContaining({ maxEntriesPerDog: 5 })
    );
    expect(useShowStore.getState().shows[0]?.maxEntriesPerDog).toBe(5);
  });

  it('clears the limit when the form sends an empty value', async () => {
    await useShowStore.getState().updateShow('show-1', { maxEntriesPerDog: undefined });
    const [, sent] = mockShowsTable.updateShow.mock.calls[0] ?? [];
    expect(sent).toHaveProperty('maxEntriesPerDog', undefined);
    expect(useShowStore.getState().shows[0]?.maxEntriesPerDog).toBeUndefined();
  });

  it('leaves the limit alone when the edit does not mention it', async () => {
    await useShowStore.getState().updateShow('show-1', { name: 'Renamed' });
    const [, sent] = mockShowsTable.updateShow.mock.calls[0] ?? [];
    expect(sent).not.toHaveProperty('maxEntriesPerDog');
    expect(useShowStore.getState().shows[0]?.maxEntriesPerDog).toBe(3);
  });
});
