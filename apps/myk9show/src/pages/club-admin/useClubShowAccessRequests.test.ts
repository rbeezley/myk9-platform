/**
 * MYK9-571 round 3 (P3-5): the badge/heading count must not depend SOLELY
 * on list_club_role_requests' own `WHERE status = 'pending'` — this is the
 * client-side filter that keeps it correct even if the RPC ever widened.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RoleRequest } from '@/services/database/role-requests';
import { useClubShowAccessRequests } from './useClubShowAccessRequests';

const listClubRoleRequestsMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/role-requests', () => ({
  approveClubRoleRequest: vi.fn(),
  denyClubRoleRequest: vi.fn(),
  listClubRoleRequests: (...args: unknown[]) => listClubRoleRequestsMock(...args),
}));

function baseRequest(overrides: Partial<RoleRequest>): RoleRequest {
  return {
    id: 'request-1',
    authUserId: 'auth-1',
    personId: 'person-1',
    requestedRole: 'secretary',
    requestedScope: 'club',
    clubId: 'club-1',
    clubName: 'Heartland Scent Work Club',
    showId: null,
    status: 'pending',
    requesterNote: null,
    reviewerNote: null,
    reviewedBy: null,
    reviewerName: null,
    reviewerEmail: null,
    reviewedAt: null,
    createdAt: '2026-09-15T12:00:00Z',
    updatedAt: '2026-09-15T12:00:00Z',
    requesterName: 'Grace Hopper',
    requesterEmail: 'grace@example.com',
    ...overrides,
  };
}

function renderTheHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useClubShowAccessRequests('club-1', vi.fn()), { wrapper });
}

describe('useClubShowAccessRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops a non-pending row even though the RPC is supposed to already filter to pending', async () => {
    listClubRoleRequestsMock.mockResolvedValue([
      baseRequest({ id: 'request-1', status: 'pending' }),
      baseRequest({ id: 'request-2', status: 'approved', requesterName: 'Ada Lovelace' }),
    ]);

    const { result } = renderTheHook();

    await waitFor(() => {
      expect(result.current.roleRequestsTabProps.pendingRequests).toHaveLength(1);
    });

    expect(result.current.roleRequestsTabProps.pendingRequests[0]?.id).toBe('request-1');
    expect(result.current.clubMembersTabs.find(tab => tab.id === 'show-access')?.badge).toBe(1);
  });
});
