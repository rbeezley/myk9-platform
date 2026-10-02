/**
 * MYK9-930, owner decision 5: Back from a club tab leaves the club page. The
 * club's tab comes from this hook, so the rule is pinned through the hook.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Club } from '@/types/club-types';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: null, hasPermission: () => false }),
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ updateClub: vi.fn() }),
}));
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

const { useClubDetailsState } = await import('../useClubDetailsState');

const club = { id: '11111111-1111-4111-8111-111111111111', name: 'Heartland' } as Club;

function RouterProbe() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output data-testid="url">{`${location.pathname}${location.search}`}</output>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

describe('useClubDetailsState tab history (MYK9-930)', () => {
  it('Back after two tab changes leaves the club page', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useClubDetailsState(club), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={['/clubs', `/clubs/${club.id}`]} initialIndex={1}>
          <RouterProbe />
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </MemoryRouter>
      ),
    });

    act(() => result.current.setActiveTab('about'));
    act(() => result.current.setActiveTab('members'));
    expect(screen.getByTestId('url')).toHaveTextContent(`/clubs/${club.id}?tab=members`);

    fireEvent.click(screen.getByText('Back'));

    expect(screen.getByTestId('url')).toHaveTextContent(/^\/clubs$/);
  });
});
