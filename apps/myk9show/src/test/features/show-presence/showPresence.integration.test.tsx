/**
 * Two-client integration test for show presence (plan §8).
 *
 * Runs two useShowPresence instances ("Alice" and "Bob") against a single
 * simulated Supabase Realtime presence channel and asserts each client sees the
 * other, and that a client drops when it leaves. This exercises the REAL
 * eventEmitter + setupOptimizedPresence wiring + dedupe — only the Supabase
 * transport is simulated. It is the deterministic, CI-safe counterpart to the
 * (flaky, prod-only, not-in-CI) browser E2E.
 */

import { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { features } from '@/config/features';
import { AuthContext, type AuthContextType } from '@/context/AuthContext';
import { useShowPresence } from '@/features/show-presence/useShowPresence';

// --- Simulated Supabase Realtime presence transport -------------------------
// A registry shared across all channels with the same name relays track/untrack
// between the two clients, mirroring how Supabase fans presence state out.
type Meta = Record<string, unknown> & { presence_ref: string };
const registry = new Map<string, Map<string, Meta[]>>();
const channelsByName = new Map<string, Set<{ fireSync: () => void }>>();

function fireSync(name: string) {
  channelsByName.get(name)?.forEach(c => c.fireSync());
}

function makeChannel(name: string, key: string) {
  const syncHandlers: Array<() => void> = [];
  const channel = {
    topic: name,
    on(type: string, opts: { event: string }, cb: () => void) {
      if (type === 'presence' && opts.event === 'sync') syncHandlers.push(cb);
      return channel;
    },
    subscribe(cb?: (status: string) => void) {
      cb?.('SUBSCRIBED');
      return channel;
    },
    track(payload: Record<string, unknown>) {
      const reg = registry.get(name) ?? new Map<string, Meta[]>();
      registry.set(name, reg);
      reg.set(key, [{ presence_ref: key, ...payload }]);
      fireSync(name);
    },
    untrack() {
      registry.get(name)?.delete(key);
      fireSync(name);
    },
    presenceState() {
      return Object.fromEntries(registry.get(name) ?? new Map<string, Meta[]>());
    },
    fireSync() {
      syncHandlers.forEach(h => h());
    },
  };
  return channel;
}

vi.mock('@/supabaseClient', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}));

vi.mock('@/config/features', () => ({ features: { showPresence: true } }));

// Each client gets its OWN identity via a per-tree AuthContext.Provider, so a
// re-render (triggered when the other client joins) never adopts the wrong user.
function makeIdentity(id: string, name: string, role: string): AuthContextType {
  return {
    user: { id, email: `${name.toLowerCase()}@example.com` },
    firstName: name,
    getUserRoles: () => [role],
  } as unknown as AuthContextType;
}

function makeWrapper(identity: AuthContextType) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/shows/s1']}>
      <AuthContext.Provider value={identity}>{children}</AuthContext.Provider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  registry.clear();
  channelsByName.clear();
  (features as { showPresence: boolean }).showPresence = true;
  vi.mocked(supabase.channel).mockImplementation((name: string, opts?: unknown) => {
    const key = (opts as { config?: { presence?: { key?: string } } })?.config?.presence?.key ?? 'anon';
    const channel = makeChannel(name, key);
    const set = channelsByName.get(name) ?? new Set();
    set.add(channel);
    channelsByName.set(name, set);
    return channel as unknown as ReturnType<typeof supabase.channel>;
  });
});

describe('show presence — two clients on one show', () => {
  it('each client sees the other, and a client drops when it leaves', async () => {
    const alice = renderHook(() => useShowPresence('s1'), {
      wrapper: makeWrapper(makeIdentity('u1', 'Alice', 'exhibitor')),
    });
    const bob = renderHook(() => useShowPresence('s1'), {
      wrapper: makeWrapper(makeIdentity('u2', 'Bob', 'judge')),
    });

    // Both clients converge on the same two-person roster.
    await waitFor(() => {
      expect(alice.result.current.present.map(p => p.userId).sort()).toEqual(['u1', 'u2']);
    });
    expect(bob.result.current.present.map(p => p.userId).sort()).toEqual(['u1', 'u2']);
    expect(bob.result.current.present.find(p => p.userId === 'u2')?.role).toBe('judge');

    // Alice leaves → Bob sees only himself.
    act(() => {
      alice.unmount();
    });
    await waitFor(() => {
      expect(bob.result.current.present.map(p => p.userId)).toEqual(['u2']);
    });

    bob.unmount();
  });
});
