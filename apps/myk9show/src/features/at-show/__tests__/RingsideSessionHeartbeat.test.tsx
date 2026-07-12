import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { RingsideSessionHeartbeat } from '../RingsideSessionHeartbeat';

const { getExistingSubscriptionMock, rpcMock } = vi.hoisted(() => ({
  getExistingSubscriptionMock: vi.fn(),
  rpcMock: vi.fn<
    (functionName: string, args?: Record<string, unknown>) => Promise<{ data: null; error: null }>
  >(() => Promise.resolve({ data: null, error: null })),
}));

vi.mock('@myk9/notifications', () => ({
  getExistingSubscription: getExistingSubscriptionMock,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: rpcMock,
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    updateProfile: vi.fn(),
  }),
}));

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  });
}

function renderHeartbeat() {
  return render(
    <Routes>
      <Route
        path="/at-show/:showId"
        element={
          <RingsideSessionHeartbeat>
            <div>Ringside child</div>
          </RingsideSessionHeartbeat>
        }
      />
    </Routes>,
    { initialRoute: '/at-show/show-1' }
  );
}

describe('RingsideSessionHeartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setVisibilityState('visible');
    getExistingSubscriptionMock.mockResolvedValue({
      endpoint: 'https://push.example/sub-1',
      keys: { p256dh: 'key', auth: 'auth' },
    });
  });

  afterEach(() => {
    setVisibilityState('visible');
  });

  it('heartbeats while visible and clears presence when hidden or unmounted', async () => {
    localStorage.setItem('dog_favorites_show-1', JSON.stringify([202, '101', 202, '', null]));
    const { unmount } = renderHeartbeat();

    expect(screen.getByText('Ringside child')).toBeInTheDocument();
    await waitFor(() =>
      // SA-011: the heartbeat NEVER sends a raw passcode — authz rides on the
      // signed-in anonymous session's app_metadata claim. p_passcode_or_null is
      // always empty, closing the un-throttled brute-force path.
      expect(rpcMock).toHaveBeenCalledWith('upsert_ringside_session', {
        p_passcode_or_null: '',
        p_subscription_endpoint: 'https://push.example/sub-1',
        p_favorited_armbands: ['202', '101'],
        p_route: '/at-show/show-1',
      })
    );

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith('clear_ringside_session_presence', {
        p_subscription_endpoint: 'https://push.example/sub-1',
        p_show_id: 'show-1',
      })
    );

    unmount();

    expect(
      rpcMock.mock.calls.filter(([fn]) => fn === 'clear_ringside_session_presence')
    ).toHaveLength(2);
  });

  it('never sends a raw passcode on any heartbeat (SA-011 claim-path guard)', async () => {
    renderHeartbeat();

    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith('upsert_ringside_session', expect.anything())
    );

    const passcodesSent = rpcMock.mock.calls
      .filter(([fn]) => fn === 'upsert_ringside_session')
      .map(([, args]) => (args as { p_passcode_or_null: string }).p_passcode_or_null);

    expect(passcodesSent.length).toBeGreaterThan(0);
    expect(passcodesSent.every(code => code === '')).toBe(true);
  });

  it('sends empty favorite armbands when no favorites are stored', async () => {
    renderHeartbeat();

    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith(
        'upsert_ringside_session',
        expect.objectContaining({
          p_favorited_armbands: [],
        })
      )
    );
  });

  it('does not upsert presence or clear presence when no push endpoint has been found', async () => {
    getExistingSubscriptionMock.mockResolvedValue(null);
    const { unmount } = renderHeartbeat();

    await waitFor(() => expect(getExistingSubscriptionMock).toHaveBeenCalled());

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    unmount();

    // No push endpoint: never upserts presence and never clears it...
    const presenceCalls = rpcMock.mock.calls.filter(
      ([fn]) => fn === 'upsert_ringside_session' || fn === 'clear_ringside_session_presence'
    );
    expect(presenceCalls).toHaveLength(0);
  });

  it('does a push-independent generation check with no endpoint (J1.3)', async () => {
    getExistingSubscriptionMock.mockResolvedValue(null);
    renderHeartbeat();

    // Even without a push subscription, the heartbeat must still detect a
    // revoked (regenerated) passcode via the lightweight generation-check RPC.
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('ringside_claim_generation_current'));
  });
});
