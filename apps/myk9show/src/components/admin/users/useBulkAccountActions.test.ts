import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({ mutateAsync }),
}));

const invokeAdminInvite = vi.hoisted(() => vi.fn());
vi.mock('@/components/users/UserDetails/useSendUserInvitation', () => ({ invokeAdminInvite }));

const restoreUser = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/users', () => ({ restoreUser }));

const hasPermission = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'auth-me' },
    userWithRoles: { databaseUserId: 'me' },
    hasPermission,
  }),
}));

const invalidateQueries = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries }),
  };
});

import { toast } from 'sonner';
import { useBulkAccountActions } from './useBulkAccountActions';

/** Pulls the `{ label, onClick }` retry action out of a mocked toast.error() call. */
function retryActionFromCall(callIndex = 0): { label: string; onClick: () => void } {
  const call = vi.mocked(toast.error).mock.calls[callIndex];
  const options = call?.[1] as { action?: { label: string; onClick: () => void } } | undefined;
  const action = options?.action;
  if (!action) throw new Error('toast.error was not called with a retry action');
  return action;
}

function user(id: string, patch: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    firstName: id,
    lastName: 'Test',
    email: `${id}@example.com`,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignInAt: null,
    status: 'active',
    ...patch,
  } as AdminUser;
}

function rosterOf(...users: AdminUser[]): Map<string, AdminUser> {
  return new Map(users.map(u => [u.id, u]));
}

describe('useBulkAccountActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    mutateAsync.mockResolvedValue({});
    invokeAdminInvite.mockResolvedValue({ data: null });
    restoreUser.mockResolvedValue({ error: null });
  });

  it('never offers Suspend on the current admin, even when selected', () => {
    const roster = rosterOf(user('a'), user('me', { user_id: 'auth-me' }));
    const { result } = renderHook(() =>
      useBulkAccountActions({
        selectedIds: ['a', 'me'],
        usersById: roster,
        onClearSelection: vi.fn(),
      })
    );
    expect(result.current.targets.suspend).toEqual(['a']);
    expect(result.current.targets.selfSkipped).toBe(true);
  });

  it('suspends every eligible id and clears the selection on full success', async () => {
    const roster = rosterOf(user('a'), user('b'));
    const onClear = vi.fn();
    const { result } = renderHook(() =>
      useBulkAccountActions({
        selectedIds: ['a', 'b'],
        usersById: roster,
        onClearSelection: onClear,
      })
    );

    await act(async () => {
      await result.current.run('suspend');
    });

    expect(mutateAsync.mock.calls.map(([arg]) => arg)).toEqual([
      { id: 'a', updates: { status: 'suspended' } },
      { id: 'b', updates: { status: 'suspended' } },
    ]);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('refreshes the roster after the run, including a retry that lands later', async () => {
    mutateAsync.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));
    const roster = rosterOf(user('a'), user('b'));
    const { result } = renderHook(() =>
      useBulkAccountActions({
        selectedIds: ['a', 'b'],
        usersById: roster,
        onClearSelection: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.run('suspend');
    });
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users'] }));

    invalidateQueries.mockClear();
    mutateAsync.mockResolvedValue({});
    await act(async () => {
      retryActionFromCall().onClick();
      await Promise.resolve();
    });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users'] }));
  });

  // MYK9-835, server-authoritative: a retry fires from a toast AFTER the bar has
  // unmounted, so it must not trust any client snapshot. It re-dispatches the
  // failed ids with `onlyIfNeverSignedIn`, and `admin-invite-user` answers with
  // its real outcome shape when the person has since signed in.
  it('retry after the bar unmounted re-sends with the server guard, and reports a sign-in as skipped', async () => {
    invokeAdminInvite.mockRejectedValueOnce(new Error('mail down'));
    const roster = rosterOf(user('a'));
    const { result, unmount } = renderHook(() =>
      useBulkAccountActions({ selectedIds: ['a'], usersById: roster, onClearSelection: vi.fn() })
    );
    await act(async () => {
      await result.current.run('invite');
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // The run cleared the selection, which unmounts the bar.
    unmount();

    // "a" signed in meanwhile; the SERVER says so.
    invokeAdminInvite.mockClear();
    invokeAdminInvite.mockResolvedValue({
      data: { ok: true, outcome: 'skipped', reason: 'already_signed_in' },
    });
    await act(async () => {
      retryActionFromCall().onClick();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('1 already signed in — not re-invited', undefined)
    );
    expect(invokeAdminInvite).toHaveBeenCalledOnce();
    expect(invokeAdminInvite).toHaveBeenCalledWith(
      expect.objectContaining({ personId: 'a', onlyIfNeverSignedIn: true })
    );
    // A skip is neither a failure nor offered for another retry.
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it('the initial bulk invite also sends the server guard and reports skips honestly', async () => {
    invokeAdminInvite.mockImplementation(async ({ personId }: { personId: string }) => ({
      data:
        personId === 'a'
          ? { ok: true, outcome: 'skipped', reason: 'already_signed_in' }
          : { ok: true, outcome: 'invited' },
    }));
    const roster = rosterOf(user('a'), user('b'));
    const { result } = renderHook(() =>
      useBulkAccountActions({
        selectedIds: ['a', 'b'],
        usersById: roster,
        onClearSelection: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.run('invite');
    });

    for (const [arg] of invokeAdminInvite.mock.calls) {
      expect(arg).toMatchObject({ onlyIfNeverSignedIn: true });
    }
    expect(toast.success).toHaveBeenCalledWith(
      'Updated 1 — 1 already signed in — not re-invited',
      undefined
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('surfaces a restore refusal as an ordinary failure with the server message', async () => {
    restoreUser.mockResolvedValue({
      error: { code: 'P0002', message: 'Person not found or not deleted' },
    });
    const roster = rosterOf(user('a', { deletedAt: new Date().toISOString() }));
    const { result } = renderHook(() =>
      useBulkAccountActions({ selectedIds: ['a'], usersById: roster, onClearSelection: vi.fn() })
    );

    await act(async () => {
      await result.current.run('restore');
    });

    // P0002 covers "not deleted" AND "no longer exists", so it is not guessed at.
    const options = vi.mocked(toast.error).mock.calls[0]?.[1] as { description?: string };
    expect(options.description).toContain('Person not found or not deleted');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports an invitee the server says no longer exists as skipped, not failed', async () => {
    invokeAdminInvite.mockResolvedValue({ data: { ok: true, outcome: 'not_found' } });
    const roster = rosterOf(user('a'));
    const { result } = renderHook(() =>
      useBulkAccountActions({ selectedIds: ['a'], usersById: roster, onClearSelection: vi.fn() })
    );

    await act(async () => {
      await result.current.run('invite');
    });

    expect(toast.success).toHaveBeenCalledWith('1 no longer exists — not invited', undefined);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('retrying suspend re-dispatches the failed ids; the status write is idempotent server-side', async () => {
    mutateAsync.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));
    const roster = rosterOf(user('a'), user('b'));
    const { result } = renderHook(() =>
      useBulkAccountActions({
        selectedIds: ['a', 'b'],
        usersById: roster,
        onClearSelection: vi.fn(),
      })
    );
    await act(async () => {
      await result.current.run('suspend');
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    mutateAsync.mockClear();
    mutateAsync.mockResolvedValue({});
    await act(async () => {
      retryActionFromCall().onClick();
      await Promise.resolve();
    });

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'b', updates: { status: 'suspended' } });
  });

  it('a person who signs in between selection and dispatch is never a suspend/invite target', () => {
    // "Targets... resolved from the current roster when the action is sent" —
    // this is exercised by `targets` itself (a useMemo over the live map), not
    // just retry: reselect the SAME hook with a roster where the sign-in has
    // already landed, and invite must exclude them immediately, no retry needed.
    const signedIn = rosterOf(user('a', { lastSignInAt: '2026-09-26T00:00:00Z' }));
    const { result } = renderHook(() =>
      useBulkAccountActions({ selectedIds: ['a'], usersById: signedIn, onClearSelection: vi.fn() })
    );
    expect(result.current.targets.invite).toEqual([]);
  });
});
