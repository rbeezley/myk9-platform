import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWaitingClubs } from '../useWaitingClubs';

const mocks = vi.hoisted(() => ({
  awaiting: vi.fn(),
  pending: vi.fn(),
  declined: vi.fn(),
}));

vi.mock('@/services/database/clubs', () => ({
  getClubsAwaitingAuthorization: mocks.awaiting,
}));
vi.mock('@/services/database/club-access-requests', () => ({
  getPendingClubAccessRequests: mocks.pending,
  getDeclinedRequestClubIds: mocks.declined,
}));

const club = (id: string, name: string) => ({
  id,
  name,
  authorized_at: null,
  created_at: '2026-09-24T12:00:00Z',
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useWaitingClubs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.awaiting.mockResolvedValue({
      data: [club('club-1', 'Asked Club'), club('club-9', 'WALK TEST'), club('club-7', 'Declined')],
      error: null,
    });
    mocks.pending.mockResolvedValue([
      {
        id: 'req-1',
        status: 'pending',
        createdClubId: 'club-1',
        requestedClubName: 'Asked Club',
        createdAt: '2026-09-24T12:00:00Z',
      },
    ]);
    mocks.declined.mockResolvedValue(['club-7']);
  });

  it('counts a waiting club with no pending request and leaves out a declined one, from the list it returns', async () => {
    const { result } = renderHook(() => useWaitingClubs(), { wrapper });
    await waitFor(() => expect(result.current.count).toBeDefined());

    expect(result.current.rows.map(r => r.name).sort()).toEqual(['Asked Club', 'WALK TEST']);
    // The count is the list's own length: one read, so the two cannot disagree.
    expect(result.current.count).toBe(result.current.rows.length);
    expect(result.current.count).toBe(2);
  });

  it('reads nothing and reports no count while disabled', () => {
    const { result } = renderHook(() => useWaitingClubs({ enabled: false }), { wrapper });
    expect(result.current.count).toBeUndefined();
    expect(mocks.awaiting).not.toHaveBeenCalled();
    expect(mocks.pending).not.toHaveBeenCalled();
  });

  it('keeps the creator filter for the list only: an unfiltered hook asks for every creator', async () => {
    const { result } = renderHook(() => useWaitingClubs(), { wrapper });
    await waitFor(() => expect(result.current.count).toBeDefined());
    expect(mocks.awaiting).toHaveBeenCalledWith(undefined);
  });
});
