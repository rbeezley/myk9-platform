/**
 * The registrations replica is trusted only for the account that verified it
 * (MYK9-1090). useAuth's auth events end that trust on sign-out or a
 * different account, never on a same-user SIGNED_IN (refocus,
 * `_recoverAndRefresh`): MYK9-834's regression was exactly that, for the
 * ringside claim cache these handlers share.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { useAuth } from './useAuth';
import {
  readRegistrationsTrust,
  recordRegistrationsTrust,
  resetRegistrationsTrustForTests,
} from '@/services/replication/dogRegistrationsTrust';

const transport = vi.hoisted(() => ({
  listener: undefined as unknown as (event: string, session: { user: User } | null) => void,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: (listener: typeof transport.listener) => {
        transport.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));

const secretary = { id: 'auth-a', app_metadata: { provider: 'email' } } as unknown as User;

describe('registrations replica trust across auth events', () => {
  beforeEach(async () => {
    await resetRegistrationsTrustForTests();
    await recordRegistrationsTrust('auth-a');
    renderHook(() => useAuth());
  });
  afterEach(async () => {
    await resetRegistrationsTrustForTests();
  });

  it('keeps trust when the same account signs in again (refocus)', async () => {
    await act(async () => transport.listener('SIGNED_IN', { user: secretary }));

    expect((await readRegistrationsTrust())?.authUserId).toBe('auth-a');
  });

  it('ends trust when a different account signs in', async () => {
    await act(async () =>
      transport.listener('SIGNED_IN', { user: { ...secretary, id: 'auth-b' } })
    );

    await waitFor(async () => expect(await readRegistrationsTrust()).toBeNull());
  });

  it('ends trust on sign-out', async () => {
    await act(async () => transport.listener('SIGNED_OUT', null));

    await waitFor(async () => expect(await readRegistrationsTrust()).toBeNull());
  });

  it('keeps trust through a token refresh', async () => {
    await act(async () => transport.listener('TOKEN_REFRESHED', { user: secretary }));

    expect((await readRegistrationsTrust())?.authUserId).toBe('auth-a');
  });
});
