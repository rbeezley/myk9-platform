/**
 * MYK9-1349: no saved roles or identity pairing may cross a sign-out, whether
 * the app signs the user out (signOut) or hears about it (SIGNED_OUT event).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { saveRbacPermissionsCache, loadRbacPermissionsCache } from '@/context/rbacPermissionsCache';
import { loadPersonIdentityCache, savePersonIdentityCache } from '@/context/personIdentityCache';
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
  savePersonIdentityCache('user-a', 'person-a');
}

describe('useAuth sign-out purges saved account caches', () => {
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

    expect(loadRbacPermissionsCache('user-a')).toBeNull();
    expect(loadPersonIdentityCache('user-a')).toBeNull();
  });

  it('a SIGNED_OUT event (expiry, suspension, another tab) clears them', async () => {
    seedCaches();
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(loadRbacPermissionsCache('user-a')).not.toBeNull();

    act(() => auth.listener?.('SIGNED_OUT', null));

    expect(loadRbacPermissionsCache('user-a')).toBeNull();
    expect(loadPersonIdentityCache('user-a')).toBeNull();
  });
});
