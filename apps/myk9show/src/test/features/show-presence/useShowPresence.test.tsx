import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { eventEmitter } from '@/services/sync/eventEmitter';
import { supabase } from '@/supabaseClient';
import { setupOptimizedPresence } from '@/utils/realtimeOptimization';
import { features } from '@/config/features';
import {
  useShowPresence,
  dedupePresence,
  activityForPath,
  entityForPath,
  presenceChannelName,
} from '@/features/show-presence/useShowPresence';

vi.mock('@/supabaseClient', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}));

vi.mock('@/utils/realtimeOptimization', () => ({
  setupOptimizedPresence: vi.fn(() => vi.fn()),
}));

vi.mock('@/config/features', () => ({ features: { showPresence: true } }));

// Phase 3 producer setters gate on the edit-awareness kill switch; control it
// here without depending on the features const. Default ON; flipped per-test.
const enabledEditAwareness = vi.fn(() => true);
vi.mock('@/features/show-presence/editAwarenessFlag', () => ({
  showEditAwarenessEnabled: () => enabledEditAwareness(),
}));

// Identity is resolved upstream (useLocalPresenceIdentity) and injected, so the
// engine takes no auth dependency — these tests pass it directly.
const IDENTITY = { userId: 'u1', name: 'Mariana', role: 'exhibitor' };

interface FakeChannel {
  topic: string;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  presenceState: ReturnType<typeof vi.fn>;
}

let lastChannel: FakeChannel;

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/shows/s1']}>{children}</MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  enabledEditAwareness.mockReturnValue(true);
  (features as { showPresence: boolean }).showPresence = true;
  vi.mocked(supabase.channel).mockImplementation((name: string) => {
    lastChannel = {
      // Supabase prefixes the channel topic with "realtime:" — the engine must
      // key sync events off this ACTUAL topic, not the un-prefixed name we passed
      // (a real bug that left the roster permanently empty, found in live E2E).
      topic: `realtime:${name}`,
      // Channels track only once joined; mirror that so the engine's joined-guard
      // is exercised rather than bypassed.
      state: 'joined',
      on: vi.fn(),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        cb?.('SUBSCRIBED');
        return lastChannel;
      }),
      track: vi.fn(),
      untrack: vi.fn(),
      presenceState: vi.fn(() => ({})),
    };
    return lastChannel as unknown as ReturnType<typeof supabase.channel>;
  });
  vi.mocked(setupOptimizedPresence).mockReturnValue(vi.fn());
});

afterEach(() => {
  eventEmitter.off('presence:sync');
});

describe('activityForPath', () => {
  it('maps routes to coarse activities', () => {
    expect(activityForPath('/at-show/ring/3')).toBe('scoring');
    expect(activityForPath('/scoresheet/score')).toBe('scoring');
    expect(activityForPath('/shows/s1/edit')).toBe('editing');
    expect(activityForPath('/exhibitor/entries')).toBe('checking-in');
    expect(activityForPath('/shows/s1')).toBe('viewing');
  });
});

describe('entityForPath', () => {
  it('extracts the class from an at-show scoring route', () => {
    expect(entityForPath('/at-show/show-1/class/abc-123')).toEqual({
      entityType: 'class',
      entityId: 'abc-123',
    });
    expect(entityForPath('/at-show/show-1/class/abc-123/score/e9')).toEqual({
      entityType: 'class',
      entityId: 'abc-123',
    });
  });

  it('returns undefined off a class route', () => {
    expect(entityForPath('/shows/show-1')).toBeUndefined();
    expect(entityForPath('/at-show/show-1')).toBeUndefined();
  });
});

describe('dedupePresence', () => {
  it('returns one entry per user, keeping the latest ts', () => {
    const out = dedupePresence({
      u2: [
        { userId: 'u2', name: 'Bob', ts: 1 },
        { userId: 'u2', name: 'Bob-newer', ts: 5 },
      ],
      u3: [{ userId: 'u3', name: 'Cara', ts: 2 }],
    });
    expect(out).toHaveLength(2);
    expect(out.find(p => p.userId === 'u2')?.name).toBe('Bob-newer');
  });

  it('skips metas with no userId and tolerates empty state', () => {
    expect(dedupePresence({})).toEqual([]);
    expect(dedupePresence({ x: [{ name: 'ghost', ts: 1 }] })).toEqual([]);
  });
});

describe('useShowPresence', () => {
  it('joins the show-scoped channel and tracks the local identity', () => {
    renderHook(() => useShowPresence('s1', IDENTITY), { wrapper });

    expect(supabase.channel).toHaveBeenCalledWith(presenceChannelName('s1'), {
      config: { presence: { key: 'u1' } },
    });
    expect(setupOptimizedPresence).toHaveBeenCalled();
    expect(lastChannel.subscribe).toHaveBeenCalled();
    expect(lastChannel.track).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', name: 'Mariana', role: 'exhibitor' })
    );
  });

  it('reflects presence-sync events keyed by the channel topic (realtime: prefix)', () => {
    const { result } = renderHook(() => useShowPresence('s1', IDENTITY), { wrapper });

    act(() => {
      eventEmitter.emit('presence:sync', {
        // setupOptimizedPresence emits keyed by channel.topic, which Supabase
        // prefixes with "realtime:". The engine must match THIS, not the name.
        channel: lastChannel.topic,
        users: 2,
        state: {
          u1: [{ userId: 'u1', name: 'Mariana', role: 'exhibitor', ts: 1 }],
          u2: [{ userId: 'u2', name: 'Bob', role: 'judge', ts: 2 }],
        },
      });
    });

    expect(result.current.present).toHaveLength(2);
    expect(result.current.present.map(p => p.name).sort()).toEqual(['Bob', 'Mariana']);
  });

  it('ignores a sync keyed by the un-prefixed name (regression: realtime: prefix)', () => {
    // Guards the live bug: comparing against presenceChannelName(showId) instead
    // of channel.topic dropped every sync, leaving the roster permanently empty.
    const { result } = renderHook(() => useShowPresence('s1', IDENTITY), { wrapper });

    act(() => {
      eventEmitter.emit('presence:sync', {
        channel: presenceChannelName('s1'), // un-prefixed — must NOT match
        users: 2,
        state: {
          u1: [{ userId: 'u1', name: 'Mariana', role: 'exhibitor', ts: 1 }],
          u2: [{ userId: 'u2', name: 'Bob', role: 'judge', ts: 2 }],
        },
      });
    });

    expect(result.current.present).toHaveLength(0);
  });

  it('ignores presence-sync events for a different channel', () => {
    const { result } = renderHook(() => useShowPresence('s1', IDENTITY), { wrapper });

    act(() => {
      eventEmitter.emit('presence:sync', {
        channel: `realtime:${presenceChannelName('OTHER')}`,
        users: 1,
        state: { z: [{ userId: 'z', name: 'Zed', ts: 9 }] },
      });
    });

    expect(result.current.present).toHaveLength(0);
  });

  it('tears down the channel on unmount', () => {
    const cleanup = vi.fn();
    vi.mocked(setupOptimizedPresence).mockReturnValue(cleanup);

    const { unmount } = renderHook(() => useShowPresence('s1', IDENTITY), { wrapper });
    const channel = lastChannel;
    unmount();

    expect(cleanup).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('does nothing without a showId', () => {
    renderHook(() => useShowPresence(undefined, IDENTITY), { wrapper });
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('does nothing without an identity (anonymous, no grant)', () => {
    renderHook(() => useShowPresence('s1', null), { wrapper });
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('opens no channel when the kill switch is off', () => {
    (features as { showPresence: boolean }).showPresence = false;
    renderHook(() => useShowPresence('s1', IDENTITY), { wrapper });
    expect(supabase.channel).not.toHaveBeenCalled();
  });
});

describe('useShowPresence edit-awareness producer (Phase 3)', () => {
  it('setEditing mutates the tracked payload and re-tracks with the editing slot', () => {
    const { result } = renderHook(() => useShowPresence('s1', IDENTITY), { wrapper });
    lastChannel.track.mockClear(); // ignore the mount-time track

    act(() => result.current.setEditing({ entityType: 'entry', entityId: 'e1' }));

    expect(lastChannel.track).toHaveBeenCalledWith(
      expect.objectContaining({ editing: { entityType: 'entry', entityId: 'e1' } })
    );
  });

  it('clearEditing removes the editing slot and re-tracks without it', () => {
    const { result } = renderHook(() => useShowPresence('s1', IDENTITY), { wrapper });
    act(() => result.current.setEditing({ entityType: 'entry', entityId: 'e1' }));
    lastChannel.track.mockClear();

    act(() => result.current.clearEditing());

    expect(lastChannel.track).toHaveBeenCalledTimes(1);
    const tracked = lastChannel.track.mock.calls[0]![0] as { editing?: unknown };
    expect(tracked.editing).toBeUndefined();
  });

  it('setEditing is inert when edit-awareness is dark (broadcasts no editing)', () => {
    enabledEditAwareness.mockReturnValue(false);
    const { result } = renderHook(() => useShowPresence('s1', IDENTITY), { wrapper });
    lastChannel.track.mockClear();

    act(() => result.current.setEditing({ entityType: 'entry', entityId: 'e1' }));

    expect(lastChannel.track).not.toHaveBeenCalled();
  });
});
