import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { fetchShowsJudgeNameParts } from '@/services/database/_shared/judgeNamesByClass';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { useMyShowJudges, type MyShowJudgeTarget } from './useMyShowJudges';

vi.mock('@/services/database/_shared/judgeNamesByClass', () => ({
  fetchShowsJudgeNameParts: vi.fn(),
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: vi.fn() },
}));

function setup(initial: MyShowJudgeTarget[]) {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(({ targets }) => useMyShowJudges(targets), {
    wrapper,
    initialProps: { targets: initial },
  });
}

afterEach(() => {
  onlineManager.setOnline(true);
});

beforeEach(() => {
  vi.mocked(fetchShowsJudgeNameParts).mockReset();
  vi.mocked(replicatedClassesTable.getClassById).mockReset();
});

describe('useMyShowJudges', () => {
  it('reads the replicated class judge when the RPC could not answer (offline)', async () => {
    // A failed batch leaves the show absent from the map.
    vi.mocked(fetchShowsJudgeNameParts).mockResolvedValue(new Map());
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
      judgeResolved: true,
      judgeName: 'Dana Whitlock',
    } as never);

    // React Query's default mode would pause the query offline and never run the fallback.
    onlineManager.setOnline(false);
    const { result } = setup([{ showId: 'show-1', classIds: ['class-a'] }]);

    await waitFor(() => expect(result.current).toEqual({ 'class-a': 'Dana Whitlock' }));
  });

  it('does not use an unresolved replicated judge', async () => {
    vi.mocked(fetchShowsJudgeNameParts).mockResolvedValue(new Map());
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
      judgeResolved: false,
      judgeName: 'Stale Name',
    } as never);

    const { result } = setup([{ showId: 'show-1', classIds: ['class-a'] }]);

    await waitFor(() => expect(replicatedClassesTable.getClassById).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });

  it('fetches again when a class is added to an already loaded show', async () => {
    vi.mocked(fetchShowsJudgeNameParts).mockResolvedValue(
      new Map([
        [
          'show-1',
          new Map([
            ['class-a', { personId: 'p1', firstName: 'Dana', lastName: 'Whitlock' }],
            ['class-b', { personId: 'p2', firstName: 'Lee', lastName: 'Okafor' }],
          ]),
        ],
      ])
    );

    const { result, rerender } = setup([{ showId: 'show-1', classIds: ['class-a'] }]);
    await waitFor(() => expect(result.current).toEqual({ 'class-a': 'Dana Whitlock' }));

    rerender({ targets: [{ showId: 'show-1', classIds: ['class-a', 'class-b'] }] });

    await waitFor(() =>
      expect(result.current).toEqual({ 'class-a': 'Dana Whitlock', 'class-b': 'Lee Okafor' })
    );
  });
});
