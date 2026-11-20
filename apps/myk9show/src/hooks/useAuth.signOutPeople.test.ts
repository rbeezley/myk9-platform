/**
 * MYK9-2255: every sign-out path (menu, expired session, another tab,
 * suspension) takes contact details off the saved people; a session appearing
 * again lets the directory load them back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  listener: undefined as ((event: string, session: unknown) => void) | undefined,
  signOut: vi.fn(),
  getSession: vi.fn(),
}));
const purge = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const release = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: auth.signOut,
    },
  },
  default: undefined,
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { clearCachedHideCounts: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/database/users/signOutPeopleContact', () => ({
  purgePeopleContactOnSignOut: purge,
}));
vi.mock('@/services/database/users/peopleContactSeal', () => ({
  releasePeopleContactSeal: release,
}));

import { useAuth } from '@/hooks/useAuth';

describe('useAuth removes contact details from saved people on sign-out', () => {
  beforeEach(() => {
    localStorage.clear();
    purge.mockClear();
    release.mockClear();
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    auth.getSession
      .mockReset()
      .mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } });
  });

  it('on a SIGNED_OUT event (expiry, suspension, another tab)', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => auth.listener?.('SIGNED_OUT', null));

    expect(purge).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it('on the menu sign-out, before the page navigates away', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });

    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('releases the seal when a session is present again', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => auth.listener?.('SIGNED_IN', { user: { id: 'user-b', app_metadata: {} } }));

    expect(release).toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
  });
});
