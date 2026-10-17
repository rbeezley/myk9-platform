/**
 * MYK9-1235: the Edit Club panel's club numbers are their own table, so saving
 * the panel is two writes: the club row (replicated) and its registry numbers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Club } from '@/types/club-types';

const mocks = vi.hoisted(() => ({
  updateClub: vi.fn(),
  saveNumbers: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: null, hasPermission: () => false }),
}));
vi.mock('@/store/clubStore', () => ({ useClubStore: () => ({ updateClub: mocks.updateClub }) }));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: { shows: unknown[] }) => unknown) => selector({ shows: [] }),
}));
vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useDeleteClubMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/services/database/club-memberships/members', () => ({
  getClubMembers: vi.fn(async () => []),
  getActiveClubMembers: (members: unknown[]) => members,
}));
vi.mock('@/services/database/clubs', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/clubs')>()),
  saveClubRegistryNumbers: mocks.saveNumbers,
}));

const { useClubDetailsState } = await import('../useClubDetailsState');

const club = {
  id: 'club-1',
  name: 'Heartland Scent Work Club',
  address: { street: '', city: '', state: '', zipCode: '', country: 'US' },
} as Club;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const { result } = renderHook(() => useClubDetailsState(club), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    ),
  });
  return { result, invalidate };
}

describe('useClubDetailsState club numbers save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateClub.mockResolvedValue(undefined);
    mocks.saveNumbers.mockResolvedValue(undefined);
  });

  it('saves the AKC and UKC numbers for the club being edited, then refreshes them', async () => {
    const { result, invalidate } = setup();

    await act(() =>
      result.current.handleClubEditComplete({
        name: 'Heartland Scent Work Club',
        registryNumbers: { AKC: '4521', UKC: 'U-9' },
      })
    );

    expect(mocks.updateClub).toHaveBeenCalledTimes(1);
    expect(mocks.saveNumbers).toHaveBeenCalledWith('club-1', { AKC: '4521', UKC: 'U-9' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['clubs', 'club-1', 'registry-numbers'] });
  });

  it('does not touch the stored numbers when the panel sent none (they never loaded)', async () => {
    const { result } = setup();

    await act(() => result.current.handleClubEditComplete({ name: 'Renamed' }));

    expect(mocks.updateClub).toHaveBeenCalledTimes(1);
    expect(mocks.saveNumbers).not.toHaveBeenCalled();
  });

  it('rejects when the numbers fail to save so the panel stays open', async () => {
    mocks.saveNumbers.mockRejectedValue(new Error('RLS denied'));
    const { result } = setup();

    await expect(
      act(() =>
        result.current.handleClubEditComplete({
          name: 'Heartland Scent Work Club',
          registryNumbers: { AKC: '4521' },
        })
      )
    ).rejects.toThrow('RLS denied');
  });
});
