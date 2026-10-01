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
// Stands in for the mounted roster query: what a refetch would return right now.
const liveRoster = vi.hoisted(() => ({ people: [] as unknown[] }));
vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries,
      getQueryCache: () => ({
        findAll: () => [{ fetch: async () => undefined, state: { data: liveRoster.people } }],
      }),
    }),
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
    liveRoster.people = [user('a'), user('b')];
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

  // MYK9-835 stale-data case: a status change lands (from elsewhere) after the
  // initial dispatch but before a retry fires. The retry must re-check this
  // action's eligibility against the CURRENT roster, not the roster at the
  // time the batch was first sent.
  it('retry skips a person whose status changed after the initial dispatch', async () => {
    mutateAsync.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));
    const roster = rosterOf(user('a'), user('b'));
    const { result, rerender } = renderHook(
      ({ usersById }: { usersById: Map<string, AdminUser> }) =>
        useBulkAccountActions({
          selectedIds: ['a', 'b'],
          usersById,
          onClearSelection: vi.fn(),
        }),
      { initialProps: { usersById: roster } }
    );

    await act(async () => {
      await result.current.run('suspend');
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    // Someone else already suspended "b" before the retry fires.
    const updated = rosterOf(user('a'), user('b', { status: 'suspended' }));
    liveRoster.people = [...updated.values()];
    rerender({ usersById: updated });

    mutateAsync.mockClear();
    await act(async () => {
      retryActionFromCall().onClick();
      await Promise.resolve();
    });

    // "b" is no longer eligible for Suspend (already suspended) — it must be
    // skipped, not re-attempted.
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('no longer eligible'));
  });

  // MYK9-835 stale-data case: the person signs in between selection and a
  // retry of a failed "Send invitation" — an invite must not go out to them.
  it('retry skips a person who signed in after the initial invite dispatch', async () => {
    invokeAdminInvite.mockRejectedValueOnce(new Error('boom'));
    const roster = rosterOf(user('a'));
    const { result, rerender } = renderHook(
      ({ usersById }: { usersById: Map<string, AdminUser> }) =>
        useBulkAccountActions({ selectedIds: ['a'], usersById, onClearSelection: vi.fn() }),
      { initialProps: { usersById: roster } }
    );

    await act(async () => {
      await result.current.run('invite');
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    const signedIn = rosterOf(user('a', { lastSignInAt: '2026-09-26T00:00:00Z' }));
    liveRoster.people = [...signedIn.values()];
    rerender({ usersById: signedIn });

    invokeAdminInvite.mockClear();
    await act(async () => {
      retryActionFromCall().onClick();
      await Promise.resolve();
    });

    expect(invokeAdminInvite).not.toHaveBeenCalled();
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
