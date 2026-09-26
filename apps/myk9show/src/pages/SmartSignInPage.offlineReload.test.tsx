/**
 * MYK9-834 (P1 #1) — end-to-end: a judge enters a show passcode through the
 * real `SmartSignInPage` → real `ringsideGrantStore` → real
 * `ringsideClaimCache`, then the device's token expires while offline and the
 * page hard-reloads (which wipes the in-memory `ringsideGrantStore` — it is
 * deliberately not persisted, see that module's docstring). The ring must
 * still open on `AtShowAccessGate` via the offline-reload fallback cache.
 *
 * Unlike `SmartSignInPage.test.tsx`, this file does NOT mock
 * `@/store/ringsideGrantStore` — the whole point is to prove `setGrant`
 * itself persists the confirmed claim (ringsideGrantStore.ts), because
 * `useRehydrateRingsideGrant`'s own effect never runs on the normal passcode
 * path (the store already holds the grant by the time it would fire).
 */

import { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import SmartSignInPage from './SmartSignInPage';
import { AtShowAccessGate } from '@/features/at-show/AtShowAccessGate';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';

vi.mock('@/components/security/TurnstileChallenge', () => ({
  TurnstileChallenge: forwardRef(function MockTurnstileChallenge(
    props: { onTokenChange: (token: string | null) => void },
    ref
  ) {
    useImperativeHandle(ref, () => ({ reset: () => props.onTokenChange(null) }));
    return (
      <button type="button" onClick={() => props.onTokenChange('turnstile-token')}>
        Complete security check
      </button>
    );
  }),
}));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const useShowQueryMock = vi.fn();
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: (showId: string) => useShowQueryMock(showId),
}));

const validatePasscodeMock = vi.fn();
vi.mock('./validatePasscode', () => ({
  validatePasscode: (...args: unknown[]) => validatePasscodeMock(...args),
}));

const startAnonymousRingsideSessionMock = vi.fn();
vi.mock('./ringsideAnonSession', () => ({
  startAnonymousRingsideSession: (...args: unknown[]) => startAnonymousRingsideSessionMock(...args),
}));

let mockUser: {
  id?: string;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
} | null = null;
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: mockUser,
    firstName: 'Jane',
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    loading: false,
    hasRole: () => false,
  }),
  getPrimaryRole: vi.fn(),
}));

vi.mock('@/features/show-today/accountTodayEntries', () => ({
  useAccountTodayAutoFavorites: () => ({
    hasAccountEntryForShow: false,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/features/at-show/useHasAnyEntryForShow', () => ({
  useHasAnyEntryForShow: () => ({ hasAnyEntryForShow: false, isLoading: false, isError: false }),
}));

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    value: online,
    configurable: true,
  });
}

function renderGate(initialRoute = '/at-show/show-x') {
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

describe('SmartSignInPage → offline reload (MYK9-834)', () => {
  const originalOnLine = window.navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    window.localStorage.clear();
    useRingsideGrantStore.getState().clearGrant();
    useRingsideGrantStore.getState().setSuppressRehydration(false);
    useShowQueryMock.mockReturnValue({ data: undefined });
    setOnline(true);
  });

  afterEach(() => {
    setOnline(originalOnLine);
  });

  it('persists the confirmed claim on normal passcode entry, and the ring survives an offline reload', async () => {
    startAnonymousRingsideSessionMock.mockResolvedValue({
      ok: true,
      role: 'judge',
      showId: 'show-x',
      showName: 'Spring Trial',
    });

    const user = userEvent.setup();
    render(<SmartSignInPage />, { initialRoute: '/sign-in' });

    await user.type(screen.getByTestId('credential-input'), 'j9f3b');
    await user.click(screen.getByTestId('continue-button'));
    await user.click(screen.getByTestId('passcode-continue-button'));

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/at-show/show-x'));

    // The bug: without persisting from `setGrant` itself, this stays null —
    // `useRehydrateRingsideGrant`'s effect never runs here because nothing on
    // this page ever calls it; only the store's own in-memory grant gets set.
    expect(window.localStorage.getItem('myk9:ringside-claim-cache')).toEqual(
      JSON.stringify({ showId: 'show-x', role: 'judge' })
    );

    // Simulate the hard reload: the in-memory store is wiped (it is
    // deliberately not persisted), the token has since expired, and the
    // device is offline — the exact scenario from the Codex finding. A real
    // reload resets the store by re-evaluating the module, not by calling
    // `clearGrant()` — that action now also purges the offline-reload cache
    // (MYK9-834 P2 fix), which is exactly the durable state a real reload
    // must NOT touch. Reset only the in-memory field directly.
    useRingsideGrantStore.setState({ activeGrant: null });
    mockUser = null;
    setOnline(false);

    renderGate();

    expect(await screen.findByText('AT SHOW CONTENT')).toBeInTheDocument();
    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      showId: 'show-x',
      role: 'judge',
      source: 'passcode',
    });
  });
});
