import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { RingsideSessionHeartbeat } from '../RingsideSessionHeartbeat';

const { getExistingSubscriptionMock, rpcMock } = vi.hoisted(() => ({
  getExistingSubscriptionMock: vi.fn(),
  rpcMock: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

vi.mock('@myk9/notifications', () => ({
  getExistingSubscription: getExistingSubscriptionMock,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: rpcMock },
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

vi.mock('@/store/ringsideGrantStore', () => ({
  useRingsideGrantStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeGrant: {
        showId: 'show-1',
        source: 'passcode',
        passcode: 'j9f3b',
      },
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
    const { unmount } = renderHeartbeat();

    expect(screen.getByText('Ringside child')).toBeInTheDocument();
    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith('upsert_ringside_session', {
        p_passcode_or_null: 'j9f3b',
        p_subscription_endpoint: 'https://push.example/sub-1',
        p_favorited_armbands: [],
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

  it('does not clear presence when no push endpoint has been found', async () => {
    getExistingSubscriptionMock.mockResolvedValue(null);
    const { unmount } = renderHeartbeat();

    await waitFor(() => expect(getExistingSubscriptionMock).toHaveBeenCalled());

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    unmount();

    expect(rpcMock).not.toHaveBeenCalled();
  });
});
