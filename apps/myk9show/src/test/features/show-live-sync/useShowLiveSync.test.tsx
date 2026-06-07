import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { supabase } from '@/supabaseClient';
import { features } from '@/config/features';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import {
  useShowLiveSync,
  showLiveSyncEnabled,
  liveSyncChannelName,
} from '@/features/show-live-sync/useShowLiveSync';

vi.mock('@/supabaseClient', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}));

vi.mock('@/config/features', () => ({ features: { showLiveSync: true } }));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn() },
}));

// The 400ms debounce in the hook. Kept in sync with NUDGE_DEBOUNCE_MS.
const DEBOUNCE_MS = 400;
const SYNC_EVENT = 'replication:sync-requested';

interface Binding {
  opts: { event: string; schema: string; table: string; filter?: string };
  cb: (payload: unknown) => void;
}
interface FakeChannel {
  topic: string;
  bindings: Binding[];
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

let lastChannel: FakeChannel | null;
let subscribeCb: ((status: string) => void) | undefined;
let dispatchSpy: ReturnType<typeof vi.spyOn>;

const setFlag = (on: boolean) => {
  (features as { showLiveSync: boolean }).showLiveSync = on;
};

const setTrials = (ids: string[]) => {
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue(
    ids.map(id => ({ id })) as unknown as Awaited<
      ReturnType<typeof replicatedTrialsTable.getTrialsByShow>
    >
  );
};

/** Count only the sync nudges (ignore any unrelated window events). */
const nudgeCount = () =>
  dispatchSpy.mock.calls.filter(([e]) => (e as Event).type === SYNC_EVENT).length;

const bindingFor = (table: string, filter?: string) =>
  lastChannel?.bindings.find(
    b => b.opts.table === table && (filter === undefined || b.opts.filter === filter)
  );

/**
 * Render the hook and flush the async trials read so the channel is created.
 * No default for `showId` — `mount(undefined)` must pass undefined through (a
 * default value would be substituted for an explicit `undefined` argument).
 */
async function mount(showId: string | undefined) {
  const utils = renderHook(() => useShowLiveSync(showId));
  await vi.advanceTimersByTimeAsync(0);
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  setFlag(true);
  setTrials([]);
  lastChannel = null;
  subscribeCb = undefined;
  dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  vi.mocked(supabase.channel).mockImplementation((name: string) => {
    const ch: FakeChannel = {
      topic: `realtime:${name}`,
      bindings: [],
      on: vi.fn((_type: string, opts: Binding['opts'], cb: Binding['cb']) => {
        ch.bindings.push({ opts, cb });
        return ch;
      }),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        subscribeCb = cb;
        return ch;
      }),
    };
    lastChannel = ch;
    return ch as unknown as ReturnType<typeof supabase.channel>;
  });
});

afterEach(() => {
  vi.useRealTimers();
  dispatchSpy.mockRestore();
});

describe('showLiveSyncEnabled', () => {
  it('reflects the feature flag', () => {
    setFlag(true);
    expect(showLiveSyncEnabled()).toBe(true);
    setFlag(false);
    expect(showLiveSyncEnabled()).toBe(false);
  });
});

describe('liveSyncChannelName', () => {
  it('namespaces the channel by show', () => {
    expect(liveSyncChannelName('abc')).toBe('show-live:abc');
  });
});

describe('useShowLiveSync', () => {
  it('opens no channel when the kill switch is off (no env override)', async () => {
    setFlag(false);
    await mount('s1');
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('opens no channel without a showId', async () => {
    await mount(undefined);
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('subscribes to show-filtered entries and one binding per trial', async () => {
    setTrials(['t1', 't2']);
    await mount('s1');

    expect(supabase.channel).toHaveBeenCalledWith('show-live:s1');
    // entries: tight show_id filter (the value-sensitive bit — assert exactly).
    expect(bindingFor('entries')?.opts.filter).toBe('show_id=eq.s1');
    // classes: one eq binding per trial (no show_id column on classes).
    expect(bindingFor('classes', 'trial_id=eq.t1')).toBeTruthy();
    expect(bindingFor('classes', 'trial_id=eq.t2')).toBeTruthy();
    expect(lastChannel?.bindings.filter(b => b.opts.table === 'classes')).toHaveLength(2);
  });

  it('still watches entries but skips classes when the show has no trials', async () => {
    setTrials([]);
    await mount('s1');

    expect(bindingFor('entries')).toBeTruthy();
    expect(lastChannel?.bindings.filter(b => b.opts.table === 'classes')).toHaveLength(0);
  });

  it('collapses a burst of changes into exactly one debounced nudge', async () => {
    setTrials(['t1']);
    await mount('s1');
    subscribeCb?.('SUBSCRIBED'); // initial connect — does not nudge

    const entries = bindingFor('entries')!;
    const classes = bindingFor('classes', 'trial_id=eq.t1')!;
    entries.cb({});
    entries.cb({});
    classes.cb({});

    expect(nudgeCount()).toBe(0); // still within the debounce window
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(nudgeCount()).toBe(1);
  });

  it('does not nudge on first connect, but does on reconnect (catch-up)', async () => {
    setTrials(['t1']);
    await mount('s1');

    subscribeCb?.('SUBSCRIBED'); // first connect
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(nudgeCount()).toBe(0);

    subscribeCb?.('SUBSCRIBED'); // reconnect
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(nudgeCount()).toBe(1);
  });

  it('removes the channel and clears the pending nudge on unmount', async () => {
    setTrials(['t1']);
    const { unmount } = await mount('s1');
    subscribeCb?.('SUBSCRIBED');

    bindingFor('entries')!.cb({}); // schedules a nudge
    unmount(); // cleanup must clear the timer + remove the channel
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(supabase.removeChannel).toHaveBeenCalledWith(lastChannel);
    expect(nudgeCount()).toBe(0);
  });

  it('dispatches a bare event with no payload (the sync writes the cache)', async () => {
    setTrials(['t1']);
    await mount('s1');
    subscribeCb?.('SUBSCRIBED');

    bindingFor('entries')!.cb({});
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    const evt = dispatchSpy.mock.calls.find(([e]) => (e as Event).type === SYNC_EVENT)?.[0] as
      | Event
      | undefined;
    expect(evt).toBeInstanceOf(Event);
    expect((evt as CustomEvent).detail).toBeUndefined();
  });
});
