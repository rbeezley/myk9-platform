/** MYK9-1235: a club edit is replicated/offline-first and never writes registry numbers. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Club } from '@/types/club-types';

const mocks = vi.hoisted(() => ({ updateClub: vi.fn(), saveNumbers: vi.fn() }));

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

describe('useClubDetailsState club edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves an offline name-only edit with no numbers write', async () => {
    mocks.updateClub.mockResolvedValue(undefined);
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useClubDetailsState(club), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </MemoryRouter>
      ),
    });

    await act(() => result.current.handleClubEditComplete({ name: 'Renamed' }));

    expect(mocks.updateClub).toHaveBeenCalledTimes(1);
    expect(mocks.saveNumbers).not.toHaveBeenCalled();
    offline.mockRestore();
  });
});
