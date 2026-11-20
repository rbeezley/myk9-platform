/**
 * MYK9-2310: a failed chunk load for the strip code (a deploy mid-session, an
 * uncached offline chunk) must still leave the removal marker set and the
 * sign-out generation bumped. Its own file: it mocks the strip module to fail.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  listener: undefined as ((event: string, session: unknown) => void) | undefined,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: vi.fn(),
    },
  },
  default: undefined,
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { clearCachedHideCounts: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/database/users/signOutPeopleRedaction', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

import { useAuth } from '@/hooks/useAuth';
import {
  currentSignOutGeneration,
  isRedactionPending,
  mustStripContacts,
} from '@/store/userStoreContactRedaction';

describe('sign-out when the strip chunk fails to load (MYK9-2310)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('sets the marker and bumps the generation synchronously', async () => {
    renderHook(() => useAuth());
    await waitFor(() => expect(auth.listener).toBeDefined());
    const before = currentSignOutGeneration();

    auth.listener?.('SIGNED_OUT', null);

    expect(isRedactionPending()).toBe(true);
    expect(currentSignOutGeneration()).toBe(before + 1);
    expect(mustStripContacts()).toBe(true);
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(isRedactionPending()).toBe(true);
  });
});
