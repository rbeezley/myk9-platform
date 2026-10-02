import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockShowsTable } = vi.hoisted(() => ({
  mockShowsTable: { createShow: vi.fn(), getAllWithStatus: vi.fn(), subscribe: vi.fn() },
}));

vi.mock('@/services/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication')>()),
  replicatedShowsTable: mockShowsTable,
}));
vi.mock('@/config/dataSource', () => ({ shouldUseMockData: () => false }));

import { useShowStore } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import type { Club } from '@/types/club-types';
import type { ShowInput } from '@/types/show-types';

/**
 * clubStore.updateClub now rejects when the write fails (so edit panels stop
 * announcing a save that did not happen). addShow's club bookkeeping must
 * therefore handle that rejection instead of firing and forgetting it.
 */
describe('showStore.addShow when the club write fails', () => {
  // A rejecting thenable: awaiting it or attaching .catch() calls `then`; firing
  // and forgetting it never does, which is exactly an unhandled rejection.
  const failure = new Error('replicated write failed');
  const settled = vi.fn((_resolve: unknown, reject?: (error: unknown) => void) =>
    reject?.(failure)
  );
  const rejectingWrite = { then: settled } as unknown as Promise<void>;
  const unhandled = vi.fn();
  const originalUpdateClub = useClubStore.getState().updateClub;

  beforeEach(() => {
    vi.clearAllMocks();
    process.on('unhandledRejection', unhandled);
    mockShowsTable.createShow.mockResolvedValue({
      id: 'show-1',
      name: 'Heartland Classic',
      startDate: '2026-10-10',
      endDate: '2026-10-11',
      clubId: 'club-1',
    });
    useClubStore.setState({
      clubs: [
        { id: 'club-1', name: 'Heartland K9', upcomingShows: [], pastShows: [] } as never as Club,
      ],
      updateClub: vi.fn().mockReturnValue(rejectingWrite),
    });
  });

  afterEach(() => {
    process.off('unhandledRejection', unhandled);
    useClubStore.setState({ updateClub: originalUpdateClub });
  });

  it('still creates the show and leaves no unhandled rejection', async () => {
    const show = await useShowStore.getState().addShow({
      name: 'Heartland Classic',
      organization: 'AKC',
      startDate: '2026-10-10',
      endDate: '2026-10-11',
      clubId: 'club-1',
    } as ShowInput);

    // Let any stray rejection reach the process-level handler.
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(show.id).toBe('show-1');
    expect(useClubStore.getState().updateClub).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });
});
