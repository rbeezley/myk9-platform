/**
 * MYK9-1349: no warm token may cross a sign-out, whether the app signs the user
 * out (signOut) or hears about it (SIGNED_OUT event). The offline copy and
 * identity pairing keep their MYK9-200 / MYK9-601 rules (cleared by the
 * lifecycle hooks on an observed user change), so they are not touched here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { saveRbacPermissionsCache, loadRbacPermissionsCache } from '@/context/rbacPermissionsCache';
import { hasFreshRbacWarmToken, saveRbacWarmToken } from '@/context/rbacWarmToken';
import type { UserPermissionsResponse } from '@/types/rbac-types';

const auth = vi.hoisted(() => ({
  listener: undefined as ((event: string, session: unknown) => void) | undefined,
  signOut: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } }),
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

import { useAuth } from '@/hooks/useAuth';

const DATA: UserPermissionsResponse = {
  roles: [],
  permissions: [],
  effectivePermissions: [],
  effectivePermissionScopes: [],
};

function seedCaches() {
  saveRbacPermissionsCache('user-a', DATA);
  saveRbacWarmToken('user-a', new Date().toISOString());
}

describe('useAuth sign-out purges warm tokens', () => {
  beforeEach(() => {
    localStorage.clear();
    auth.signOut.mockReset().mockResolvedValue({ error: null });
  });

  it('signOut() clears them before navigating away', async () => {
    seedCaches();
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });

    expect(hasFreshRbacWarmToken('user-a')).toBe(false);
    expect(loadRbacPermissionsCache('user-a')).not.toBeNull();
  });

  it('a SIGNED_OUT event (expiry, suspension, another tab) clears them', async () => {
    seedCaches();
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(hasFreshRbacWarmToken('user-a')).toBe(true);

    act(() => auth.listener?.('SIGNED_OUT', null));

    expect(hasFreshRbacWarmToken('user-a')).toBe(false);
    expect(loadRbacPermissionsCache('user-a')).not.toBeNull();
  });
});
