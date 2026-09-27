/**
 * MYK9-860 — direct coverage of the data path ClubOfficialsLine.test.tsx
 * cannot reach: the real getClubAdmins/getClubShowManagers wiring, the
 * null-name filter, and the per-source `.catch(() => [])` that must let one
 * unreadable group (RLS-denied, or a genuinely broken query) fall back to []
 * without losing the other group's names.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/database/club-memberships', () => ({
  getClubAdmins: vi.fn(),
  getClubShowManagers: vi.fn(),
}));

import { getClubAdmins, getClubShowManagers } from '@/services/database/club-memberships';
import { useClubOfficials } from './useClubOfficials';

const mockedGetClubAdmins = vi.mocked(getClubAdmins);
const mockedGetClubShowManagers = vi.mocked(getClubShowManagers);

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}

describe('useClubOfficials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines admin and secretary names once both reads resolve', async () => {
    mockedGetClubAdmins.mockResolvedValue([{ personId: 'p1', personName: 'Jane Doe' }]);
    mockedGetClubShowManagers.mockResolvedValue([
      {
        personId: 'p2',
        personName: 'Pat Lee',
        personEmail: null,
        isClubMember: true,
        membershipStatus: 'active',
      },
    ]);

    const { result } = renderHook(() => useClubOfficials('club-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({
      adminNames: ['Jane Doe'],
      secretaryNames: ['Pat Lee'],
    });
    expect(mockedGetClubAdmins).toHaveBeenCalledWith('club-1');
    expect(mockedGetClubShowManagers).toHaveBeenCalledWith('club-1');
  });

  it('drops entries with no resolvable person name', async () => {
    mockedGetClubAdmins.mockResolvedValue([{ personId: 'p1', personName: null }]);
    mockedGetClubShowManagers.mockResolvedValue([]);

    const { result } = renderHook(() => useClubOfficials('club-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({ adminNames: [], secretaryNames: [] });
  });

  it('falls back to [] for the group that errors, without losing the other group', async () => {
    // Mirrors an RLS-denied read (a guest, or a viewer unauthorized for
    // get_club_show_managers) — and, just as importantly, a genuinely broken
    // query: both throw, and both must be indistinguishable to this hook
    // (the display responsibility ends at "no names for this viewer").
    mockedGetClubAdmins.mockRejectedValue(new Error('42501: not authorized'));
    mockedGetClubShowManagers.mockResolvedValue([
      {
        personId: 'p2',
        personName: 'Pat Lee',
        personEmail: null,
        isClubMember: true,
        membershipStatus: 'active',
      },
    ]);

    const { result } = renderHook(() => useClubOfficials('club-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({ adminNames: [], secretaryNames: ['Pat Lee'] });
  });

  it('does not query when no clubId is given', () => {
    renderHook(() => useClubOfficials(undefined), { wrapper: createWrapper() });

    expect(mockedGetClubAdmins).not.toHaveBeenCalled();
    expect(mockedGetClubShowManagers).not.toHaveBeenCalled();
  });
});
