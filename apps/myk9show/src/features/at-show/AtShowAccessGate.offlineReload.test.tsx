/**
 * MYK9-834 — the offline-reload fallback that keeps a passcode judge's ring
 * open after `@supabase/auth-js` reports `session: null` for a
 * genuinely-expired-but-never-revoked anonymous session while offline (see
 * `useAuth.ringsideOfflineReload.test.ts` for the real-client proof of that
 * gap, and `ringsideClaimCache.ts` for the mechanism). Drives the real
 * `AtShowAccessGate` + `useRehydrateRingsideGrant` + `ringsideGrantStore` +
 * `ringsideClaimCache`; only the upstream `useAuthContext()` is stubbed,
 * exactly as the sibling `AtShowAccessGate.test.tsx` already does, and
 * `navigator.onLine` stands in for the network signal.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
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
  useAccountTodayAutoFavorites: () => ({ hasAccountEntryForShow: false, isLoading: false, error: null }),
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

describe('AtShowAccessGate offline-reload fallback', () => {
  const originalOnLine = window.navigator.onLine;

  beforeEach(() => {
    mockUser = null;
    window.localStorage.clear();
    useRingsideGrantStore.getState().clearGrant();
    useRingsideGrantStore.getState().setSuppressRehydration(false);
    setOnline(true);
  });

  afterEach(() => {
    setOnline(originalOnLine);
  });

  it('admits a passcode judge offline when no live session but a cached claim matches this show', async () => {
    persistRingsideClaim({ showId: 'show-1', role: 'judge' });
    setOnline(false);
    mockUser = null;

    renderGate();

    expect(await screen.findByText('AT SHOW CONTENT')).toBeInTheDocument();
    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      showId: 'show-1',
      role: 'judge',
      source: 'passcode',
    });
  });

  it('never falls back to the cache while online — a null user online is really signed out', () => {
    persistRingsideClaim({ showId: 'show-1', role: 'judge' });
    setOnline(true);
    mockUser = null;

    renderGate();

    expect(screen.getByText('SIGN IN PAGE')).toBeInTheDocument();
    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
  });

  it('does not admit offline with no cached claim at all', () => {
    setOnline(false);
    mockUser = null;

    renderGate();

    expect(screen.getByText('SIGN IN PAGE')).toBeInTheDocument();
    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
  });

  it('never applies a cached claim scoped to a different show', () => {
    persistRingsideClaim({ showId: 'other-show', role: 'judge' });
    setOnline(false);
    mockUser = null;

    renderGate();

    expect(screen.getByText('SIGN IN PAGE')).toBeInTheDocument();
    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
  });

  it('still respects suppressRehydration while offline (revocation race window)', () => {
    persistRingsideClaim({ showId: 'show-1', role: 'judge' });
    setOnline(false);
    mockUser = null;
    useRingsideGrantStore.getState().setSuppressRehydration(true);

    renderGate();

    expect(screen.getByText('SIGN IN PAGE')).toBeInTheDocument();
    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
  });

  it('persists the claim cache the moment a live claim is confirmed, for a later offline reload', async () => {
    mockUser = {
      is_anonymous: true,
      app_metadata: { kind: 'ringside_passcode', show_id: 'show-1', ringside_role: 'judge' },
    };
    setOnline(true);

    renderGate();

    expect(await screen.findByText('AT SHOW CONTENT')).toBeInTheDocument();
    expect(window.localStorage.getItem('myk9:ringside-claim-cache')).toEqual(
      JSON.stringify({ showId: 'show-1', role: 'judge' })
    );
  });
});
