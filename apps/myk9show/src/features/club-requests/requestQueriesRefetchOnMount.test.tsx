/**
 * A request status or a club-admin request inbox must be re-read whenever the
 * surface is opened again. The app's queries default to a five-minute
 * staleTime with focus refetch off, so without `refetchOnMount: 'always'` a
 * requester returning to Request additional access, or an admin reopening
 * Members, sees the cached answer from before the other side acted.
 *
 * Each case mounts a hook under the app's real defaults, unmounts it, mounts
 * it again inside the stale window, and asserts the read ran twice. The
 * requester's own status also re-reads when the tab regains focus, and a
 * failed re-read fails CLOSED instead of showing the cached answer.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
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

  it("re-reads the requester's own status when the tab regains focus", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ kind: 'pending' });
    const client = appLikeClient();
    const { first } = mountTwice(client, () =>
      useClubRequestController({
        queryKey: ['my-request', 'club-focus'],
        preState: null,
        fetchStatus,
        submitRequest: vi.fn(),
        successMessage: 'sent',
        logContext: {},
      })
    );

    await waitFor(() => expect(first.result.current.state.kind).toBe('pending'));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(2));
    focusManager.setFocused(undefined);
  });

  it('fails closed when the re-read errors, instead of showing the cached form', async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'available' })
      .mockRejectedValue(new Error('network'));
    const client = appLikeClient();
    const { first, remount } = mountTwice(client, () =>
      useClubRequestController({
        queryKey: ['my-request', 'club-error'],
        preState: null,
        fetchStatus,
        submitRequest: vi.fn(),
        successMessage: 'sent',
        logContext: {},
      })
    );

    await waitFor(() => expect(first.result.current.state.kind).toBe('available'));
    const second = remount();
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.state.kind).toBe('error'));
  });

  it('shows loading, not a cached form, while a returning status re-read is in flight', async () => {
    let resolveSecond!: (value: { kind: 'denied'; reviewerNote: null }) => void;
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'available' })
      .mockImplementationOnce(() => new Promise(resolve => (resolveSecond = resolve)));
    const client = appLikeClient();
    const { first, remount } = mountTwice(client, () =>
      useClubRequestController({
        queryKey: ['my-request', 'club-recheck'],
        preState: null,
        fetchStatus,
        submitRequest: vi.fn(),
        successMessage: 'sent',
        logContext: {},
      })
    );

    await waitFor(() => expect(first.result.current.state.kind).toBe('available'));
    const second = remount();
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(2));
    expect(second.result.current.state.kind).toBe('loading');

    act(() => resolveSecond({ kind: 'denied', reviewerNote: null }));
    await waitFor(() => expect(second.result.current.state.kind).toBe('denied'));
  });

  it('keeps a cached pending answer visible while it is re-read', async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'pending' })
      .mockImplementationOnce(() => new Promise(() => undefined));
    const client = appLikeClient();
    const { first, remount } = mountTwice(client, () =>
      useClubRequestController({
        queryKey: ['my-request', 'club-pending-recheck'],
        preState: null,
        fetchStatus,
        submitRequest: vi.fn(),
        successMessage: 'sent',
        logContext: {},
      })
    );

    await waitFor(() => expect(first.result.current.state.kind).toBe('pending'));
    const second = remount();
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(2));
    expect(second.result.current.state.kind).toBe('pending');
  });

  it('stops holding a submitted request as pending once a later read says otherwise', async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'available' })
      .mockResolvedValueOnce({ kind: 'pending' })
      .mockResolvedValue({ kind: 'available' });
    const submitRequest = vi.fn().mockResolvedValue('request-1');
    const client = appLikeClient();
    const { first } = mountTwice(client, () =>
      useClubRequestController({
        queryKey: ['my-request', 'club-after-submit'],
        preState: null,
        fetchStatus,
        submitRequest,
        successMessage: 'sent',
        logContext: {},
      })
    );

    await waitFor(() => expect(first.result.current.state.kind).toBe('available'));
    act(() => first.result.current.submit('Please add me.'));
    // The post-submit read returns pending.
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(first.result.current.state.kind).toBe('pending'));

    // Later the membership is removed and the server says a new ask is open.
    act(() => first.result.current.retry());
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(first.result.current.state.kind).toBe('available'));
  });
});
