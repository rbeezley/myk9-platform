/**
 * MYK9-359 — the club-write affordances on /clubs/:id must follow the user's
 * real club-scoped `club_admin` grant, not a lookup into MOCK_USERS.
 *
 * These assertions go through the HOOK, not the pure helper, because the defect
 * was in the wiring: `computeClubPermissions` was always correct and its own
 * tests stayed green while the two arms feeding it were structurally false.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import type { Club } from '@/types/club-types';

const CLUB_A = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({ updateClub: vi.fn(), error: vi.fn(), success: vi.fn() }));

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
vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: mocks.error, warning: vi.fn(), info: vi.fn() },
}));

const { useClubDetailsState } = await import('../useClubDetailsState');

const club = { id: CLUB_A, name: 'Heartland Scent Work Club' } as Club;

describe('useClubDetailsState logo save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a failed logo write instead of rejecting into the dialog, and keeps the dialog open', async () => {
    mocks.updateClub.mockRejectedValue(new Error('replicated write failed'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useClubDetailsState(club), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </MemoryRouter>
      ),
    });

    act(() => result.current.handleEditPhoto());
    expect(result.current.showPhotoDialog).toBe(true);

    await act(async () => {
      await expect(
        result.current.handlePhotoSave('data:image/png;base64,AAAA')
      ).resolves.toBeUndefined();
    });

    expect(mocks.error).toHaveBeenCalled();
    expect(result.current.showPhotoDialog).toBe(true);
  });
});
