/**
 * MYK9-835 (Codex P1 on 794a83820): a toast-driven "Retry failed" fires AFTER the
 * bulk bar has unmounted (every run clears the selection, which unmounts
 * BulkAccountActions). A roster ref owned by that component stops updating at
 * that moment, so the retry would act on the roster as it was at dispatch time.
 * Eligibility must come from the live roster query instead, refetched before the
 * retry runs — an invitation is an email to a real person.
 */
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { queryKeys } from '@/lib/queryClient';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({ mutateAsync }),
}));

const invokeAdminInvite = vi.hoisted(() => vi.fn());
vi.mock('@/components/users/UserDetails/useSendUserInvitation', () => ({ invokeAdminInvite }));
vi.mock('@/services/database/users', () => ({ restoreUser: vi.fn() }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'auth-me' },
    userWithRoles: { databaseUserId: 'me' },
    hasPermission: () => true,
  }),
}));

import { toast } from 'sonner';
import { useBulkAccountActions } from './useBulkAccountActions';

function person(id: string, patch: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    firstName: id,
    lastName: 'Test',
    email: `${id}@example.com`,
    lastSignInAt: null,
    status: 'active',
    ...patch,
  } as AdminUser;
}

function retryAction(): { onClick: () => void } {
  const options = vi.mocked(toast.error).mock.calls[0]?.[1] as
    { action?: { onClick: () => void } } | undefined;
  if (!options?.action) throw new Error('no Retry failed action on the toast');
  return options.action;
}

describe('bulk retry after the bar unmounted', () => {
  let server: AdminUser[];
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    server = [person('a'), person('b')];
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The page keeps the roster query mounted for the whole session.
    const observer = new QueryObserver(queryClient, {
      queryKey: [...queryKeys.users.all, 'admin', { showDeleted: false }],
      queryFn: async () => server,
    });
    observer.subscribe(() => {});
  });

  async function dispatchThenUnmount(action: 'invite' | 'suspend') {
    await queryClient.refetchQueries({ queryKey: queryKeys.users.all });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const roster = new Map(server.map(u => [u.id, u]));
    const { result, unmount } = renderHook(
      () =>
        useBulkAccountActions({
          selectedIds: ['a', 'b'],
          usersById: roster,
          onClearSelection: vi.fn(),
        }),
      { wrapper }
    );
    await act(async () => {
      await result.current.run(action);
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // The run cleared the selection, which unmounts the bar.
    unmount();
  }

  it('does not re-send an invitation to someone who signed in after the bar unmounted', async () => {
    invokeAdminInvite.mockRejectedValue(new Error('mail down'));
    await dispatchThenUnmount('invite');

    // "a" signs in on the server; "b" has not. The mailer recovers.
    server = [person('a', { lastSignInAt: '2026-09-30T00:00:00Z' }), person('b')];
    invokeAdminInvite.mockClear();
    invokeAdminInvite.mockResolvedValue({});
    await act(async () => {
      retryAction().onClick();
    });

    await waitFor(() => expect(invokeAdminInvite).toHaveBeenCalledTimes(1));
    expect(invokeAdminInvite).toHaveBeenCalledWith(expect.objectContaining({ personId: 'b' }));
    expect(invokeAdminInvite).not.toHaveBeenCalledWith(expect.objectContaining({ personId: 'a' }));
    expect(toast.info).toHaveBeenCalledWith('1 item is no longer eligible and was skipped');
  });

  it('skips and reports people whose status changed after the bar unmounted', async () => {
    mutateAsync.mockRejectedValue(new Error('boom'));
    await dispatchThenUnmount('suspend');

    // Another admin suspended both people before the retry is clicked.
    server = [person('a', { status: 'suspended' }), person('b', { status: 'suspended' })];
    mutateAsync.mockClear();
    mutateAsync.mockResolvedValue({});
    await act(async () => {
      retryAction().onClick();
    });

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('no longer eligible'))
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
