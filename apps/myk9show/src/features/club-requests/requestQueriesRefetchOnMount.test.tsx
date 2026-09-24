/**
 * A request status or a club-admin request inbox must be re-read whenever the
 * surface is opened again. The app's queries default to a five-minute
 * staleTime with focus refetch off, so without `refetchOnMount: 'always'` a
 * requester returning to Request additional access, or an admin reopening
 * Members, sees the cached answer from before the other side acted.
 *
 * Each case mounts a hook under the app's real defaults, unmounts it, mounts
 * it again inside the stale window, and asserts the read ran twice.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listClubMembershipRequests: vi.fn(),
  listClubRoleRequests: vi.fn(),
}));

vi.mock('@/services/database/club-membership-requests', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/club-membership-requests')>()),
  listClubMembershipRequests: mocks.listClubMembershipRequests,
}));
vi.mock('@/services/database/role-requests', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/role-requests')>()),
  listClubRoleRequests: mocks.listClubRoleRequests,
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useClubRequestController } from './useClubRequestController';
import { useClubMembershipRequests } from '@/pages/club-admin/useClubMembershipRequests';
import { useClubShowAccessRequests } from '@/pages/club-admin/useClubShowAccessRequests';

/** Same defaults the app's queryClient applies (lib/queryClient.ts). */
function appLikeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: false },
    },
  });
}

function mountTwice<T>(client: QueryClient, useHook: () => T) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  const first = renderHook(useHook, { wrapper });
  return {
    first,
    remount: () => {
      first.unmount();
      return renderHook(useHook, { wrapper });
    },
  };
}

describe('request reads refetch when their surface is opened again', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listClubMembershipRequests.mockResolvedValue([]);
    mocks.listClubRoleRequests.mockResolvedValue([]);
  });

  it("re-reads the requester's own status on return", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ kind: 'pending' });
    const client = appLikeClient();
    const { remount } = mountTwice(client, () =>
      useClubRequestController({
        queryKey: ['my-request', 'club-1'],
        preState: null,
        fetchStatus,
        submitRequest: vi.fn(),
        successMessage: 'sent',
        logContext: {},
      })
    );

    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
    remount();
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(2));
  });

  it("re-reads the club admin's membership-request inbox on return", async () => {
    const client = appLikeClient();
    const { remount } = mountTwice(client, () => useClubMembershipRequests('club-1', vi.fn()));

    await waitFor(() => expect(mocks.listClubMembershipRequests).toHaveBeenCalledTimes(1));
    remount();
    await waitFor(() => expect(mocks.listClubMembershipRequests).toHaveBeenCalledTimes(2));
  });

  it("re-reads the club admin's show-access request inbox on return", async () => {
    const client = appLikeClient();
    const { remount } = mountTwice(client, () => useClubShowAccessRequests('club-1', vi.fn()));

    await waitFor(() => expect(mocks.listClubRoleRequests).toHaveBeenCalledTimes(1));
    remount();
    await waitFor(() => expect(mocks.listClubRoleRequests).toHaveBeenCalledTimes(2));
  });
});
