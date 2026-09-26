/**
 * MYK9-834 (P1 #2) — end-to-end: a passcode judge signs out through the real
 * `useAuth().signOut()` (the same function the Account menu calls via
 * `useAuthContext().signOut()`), then the device goes offline and reloads.
 * The offline-reload fallback cache (`ringsideClaimCache.ts`) must not
 * resurrect the just-ended ringside access — `AtShowAccessGate` must fall
 * through to sign-in, not admit the ring.
 *
 * Drives the real `useAuth` hook (only the Supabase client is mocked, via the
 * project-wide `@/lib/supabase` → `mockSupabase` alias in test/setup.ts) and
 * the real `AtShowAccessGate` + `ringsideGrantStore` + `ringsideClaimCache`;
 * only `useAuthContext` (consumed by the gate) is stubbed to reflect
 * whatever `useAuth` currently reports, exactly as production's
 * `AuthContext.tsx` wires it.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { useAuth } from '@/hooks/useAuth';
import { mockSupabase } from '@/test/mocks/supabase';
import { AtShowAccessGate } from './AtShowAccessGate';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { persistRingsideClaim } from './ringsideClaimCache';

let mockUser: {
  id?: string;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
} | null = null;

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: mockUser,
    loading: false,
    hasRole: () => false,
  }),
}));

vi.mock('@/features/show-today/accountTodayEntries', () => ({
  useAccountTodayAutoFavorites: () => ({
    hasAccountEntryForShow: false,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('./useHasAnyEntryForShow', () => ({
  useHasAnyEntryForShow: () => ({ hasAnyEntryForShow: false, isLoading: false, isError: false }),
}));

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    value: online,
    configurable: true,
  });
}

function renderGate(initialRoute = '/at-show/show-1') {
  return render(
    <Routes>
      <Route
        path="/at-show/:showId"
        element={
          <AtShowAccessGate>
            <div>AT SHOW CONTENT</div>
          </AtShowAccessGate>
        }
      />
      <Route path="/sign-in" element={<div>SIGN IN PAGE</div>} />
    </Routes>,
    { initialRoute }
  );
}

describe('sign-out through the Account-menu path, then an offline reload (MYK9-834)', () => {
  const originalOnLine = window.navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    window.localStorage.clear();
    useRingsideGrantStore.getState().clearGrant();
    useRingsideGrantStore.getState().setSuppressRehydration(false);
    setOnline(true);

    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  afterEach(() => {
    setOnline(originalOnLine);
  });

  it('does not restore ringside access after a real sign-out and an offline reload', async () => {
    // A judge previously entered a passcode; the offline-reload cache holds
    // the confirmed claim (as `ringsideGrantStore.setGrant` now persists it).
    persistRingsideClaim({ showId: 'show-1', role: 'judge' });

    let authChangeCallback: (event: string, session: unknown) => void = () => {};
    mockSupabase.auth.onAuthStateChange.mockImplementation(
      (cb: (event: string, session: unknown) => void) => {
        authChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }
    );

    const { result } = renderHook(() => useAuth());

    // The real sign-out path: Account menu → useAuthContext().signOut() →
    // useAuth().signOut() → supabase.auth.signOut() → the client's own
    // SIGNED_OUT notification (simulated here, as the mock client has no
    // listener wiring of its own).
    await act(async () => {
      await result.current.signOut();
      authChangeCallback('SIGNED_OUT', null);
    });

    // Now the device goes offline and reloads: no live user, no store grant
    // (a hard reload wipes the store), and the cache must already be empty.
    mockUser = null;
    setOnline(false);

    renderGate();

    expect(screen.getByText('SIGN IN PAGE')).toBeInTheDocument();
    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
  });
});
