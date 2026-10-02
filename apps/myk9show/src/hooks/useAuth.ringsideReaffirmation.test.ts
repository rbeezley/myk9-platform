import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { useAuth } from './useAuth';
import { useRehydrateRingsideGrant } from '@/features/at-show/useRehydrateRingsideGrant';
import { readPersistedRingsideClaim } from '@/features/at-show/ringsideClaimCache';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
const transport = vi.hoisted(() => ({
  listener: undefined as unknown as (event: string, session: { user: User } | null) => void,
  getSession: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: transport.getSession,
      onAuthStateChange: (listener: typeof transport.listener) => {
        transport.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
let auth: ReturnType<typeof useAuth> | undefined;
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => {
    if (!auth) throw new Error('Auth bridge must be rendered before claim rehydration');
    return auth;
  },
}));
const judge: User = {
  id: 'judge-1',
  aud: 'authenticated',
  user_metadata: {},
  created_at: '2026-10-02T12:00:00.000Z',
  is_anonymous: true,
  app_metadata: { kind: 'ringside_passcode', show_id: 'show-1', ringside_role: 'judge' },
};
function renderSession() {
  return renderHook(() => {
    auth = useAuth();
    return { auth, role: useRehydrateRingsideGrant('show-1') };
  });
}
function online(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}
describe('ringside identity reaffirmation with real hooks and durable store', () => {
  beforeEach(() => {
    auth = undefined;
    transport.getSession.mockReset();
    localStorage.clear();
    useRingsideGrantStore.setState({ activeGrant: null, suppressRehydration: false });
    online(true);
    transport.getSession.mockResolvedValue({ data: { session: { user: judge } } });
  });
  afterEach(() => {
    online(true);
  });
  it('preserves a same-user claim through refocus and expired offline reload', async () => {
    const mounted = renderSession();
    await waitFor(() => expect(mounted.result.current.role).toBe('judge'));
    const original = useRingsideGrantStore.getState().activeGrant;
    await act(async () => transport.listener('SIGNED_IN', { user: judge }));
    expect(readPersistedRingsideClaim('show-1')).toBe('judge');
    expect(useRingsideGrantStore.getState().activeGrant).toBe(original);
    mounted.unmount();
    useRingsideGrantStore.setState({ activeGrant: null });
    online(false);
    transport.getSession.mockResolvedValue({ data: { session: null } });
    const reloaded = renderSession();
    await waitFor(() => expect(reloaded.result.current.role).toBe('judge'));
    expect(useRingsideGrantStore.getState().activeGrant?.unconfirmedOffline).toBe(true);
    await act(async () => online(true));
    await waitFor(() => expect(reloaded.result.current.role).toBeNull());
    expect(readPersistedRingsideClaim('show-1')).toBeNull();
  });
  it('confirms the restored grant on reconnect with a valid same-user session', async () => {
    const mounted = renderSession();
    await waitFor(() => expect(mounted.result.current.role).toBe('judge'));
    mounted.unmount();
    useRingsideGrantStore.setState({ activeGrant: null });
    online(false);
    transport.getSession.mockResolvedValue({ data: { session: null } });
    const reloaded = renderSession();
    await waitFor(() => expect(reloaded.result.current.role).toBe('judge'));
    await act(async () => transport.listener('SIGNED_IN', { user: judge }));
    await act(async () => online(true));
    expect(reloaded.result.current.role).toBe('judge');
    expect(useRingsideGrantStore.getState().activeGrant).toMatchObject({
      authUserId: judge.id,
      unconfirmedOffline: false,
    });
    expect(readPersistedRingsideClaim('show-1')).toBe('judge');
  });
  it('clears the restored grant when reconnect confirms a user without its claim', async () => {
    const mounted = renderSession();
    await waitFor(() => expect(mounted.result.current.role).toBe('judge'));
    mounted.unmount();
    useRingsideGrantStore.setState({ activeGrant: null });
    online(false);
    transport.getSession.mockResolvedValue({ data: { session: null } });
    const reloaded = renderSession();
    await waitFor(() => expect(reloaded.result.current.role).toBe('judge'));
    await act(async () =>
      transport.listener('TOKEN_REFRESHED', {
        user: { ...judge, app_metadata: {} },
      })
    );
    await act(async () => online(true));
    expect(reloaded.result.current.role).toBeNull();
    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
    expect(readPersistedRingsideClaim('show-1')).toBeNull();
  });
  it.each(['SIGNED_OUT', 'SIGNED_IN'])('clears the old durable claim on %s', async event => {
    const mounted = renderSession();
    await waitFor(() => expect(mounted.result.current.role).toBe('judge'));
    await act(async () =>
      transport.listener(
        event,
        event === 'SIGNED_OUT'
          ? null
          : {
              user: {
                ...judge,
                id: 'different-judge',
                is_anonymous: false,
                app_metadata: { provider: 'email' },
              },
            }
      )
    );
    expect(readPersistedRingsideClaim('show-1')).toBeNull();
  });
  it('ignores a delayed initial session after a newer account switch', async () => {
    let resolve!: (value: { data: { session: { user: User } } }) => void;
    transport.getSession.mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    const mounted = renderSession();
    await act(async () =>
      transport.listener('SIGNED_IN', {
        user: {
          ...judge,
          id: 'different-judge',
          is_anonymous: false,
          app_metadata: { provider: 'email' },
        },
      })
    );
    await act(async () => resolve({ data: { session: { user: judge } } }));
    expect(mounted.result.current.auth.user?.id).toBe('different-judge');
  });
});
