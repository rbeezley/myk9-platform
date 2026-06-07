import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
const PAST_DEBOUNCE_MS = DEBOUNCE_MS + 80;
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

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

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

const classesBindings = () =>
  lastChannel?.bindings.filter(b => b.opts.table === 'classes') ?? [];

const bindingFor = (table: string, filter?: string) =>
  lastChannel?.bindings.find(
    b => b.opts.table === table && (filter === undefined || b.opts.filter === filter)
  );

/** Render the hook under a fresh QueryClient and return the client for invalidation. */
function mount(showId: string | undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const utils = renderHook(() => useShowLiveSync(showId), { wrapper });
  return { ...utils, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
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
    mount('s1');
    await sleep(50);
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('opens no channel without a showId', async () => {
    mount(undefined);
    await sleep(50);
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('subscribes to show-filtered entries and one binding per trial', async () => {
    setTrials(['t1', 't2']);
    mount('s1');

    await waitFor(() => expect(classesBindings()).toHaveLength(2));
    expect(supabase.channel).toHaveBeenCalledWith('show-live:s1');
    // entries: tight show_id filter (the value-sensitive bit — assert exactly).
    expect(bindingFor('entries')?.opts.filter).toBe('show_id=eq.s1');
    // classes: one eq binding per trial (no show_id column on classes).
    expect(bindingFor('classes', 'trial_id=eq.t1')).toBeTruthy();
    expect(bindingFor('classes', 'trial_id=eq.t2')).toBeTruthy();
  });

  it('still watches entries but skips classes when the show has no trials', async () => {
    setTrials([]);
    mount('s1');

    await waitFor(() => expect(bindingFor('entries')).toBeTruthy());
    expect(classesBindings()).toHaveLength(0);
  });

  it('rebinds with class subscriptions once the trials cache fills (cold start)', async () => {
    // Cold start: replicated trials not yet synced → entries-only.
    setTrials([]);
    const { queryClient } = mount('s1');
    await waitFor(() => expect(bindingFor('entries')).toBeTruthy());
    expect(classesBindings()).toHaveLength(0);
    const firstChannel = lastChannel;

    // Startup sync lands trials and invalidates ['trials'] (what triggerSync does).
    setTrials(['t1']);
    queryClient.invalidateQueries({ queryKey: ['trials'] });

    // The refetch must rebind: new channel with the class subscription, old removed.
    await waitFor(() => expect(classesBindings()).toHaveLength(1));
    expect(bindingFor('classes', 'trial_id=eq.t1')).toBeTruthy();
    expect(supabase.removeChannel).toHaveBeenCalledWith(firstChannel);
  });

  it('collapses a burst of changes into exactly one debounced nudge', async () => {
    setTrials(['t1']);
    mount('s1');
    await waitFor(() => expect(bindingFor('classes', 'trial_id=eq.t1')).toBeTruthy());
    subscribeCb?.('SUBSCRIBED'); // initial connect — does not nudge

    bindingFor('entries')!.cb({});
    bindingFor('entries')!.cb({});
    bindingFor('classes', 'trial_id=eq.t1')!.cb({});

    await waitFor(() => expect(nudgeCount()).toBe(1));
    await sleep(PAST_DEBOUNCE_MS); // ensure the burst really collapsed to one
    expect(nudgeCount()).toBe(1);
  });

  it('does not nudge on first connect, but does on reconnect (catch-up)', async () => {
    setTrials(['t1']);
    mount('s1');
    await waitFor(() => expect(bindingFor('entries')).toBeTruthy());

    subscribeCb?.('SUBSCRIBED'); // first connect
    await sleep(PAST_DEBOUNCE_MS);
    expect(nudgeCount()).toBe(0);

    subscribeCb?.('SUBSCRIBED'); // reconnect
    await waitFor(() => expect(nudgeCount()).toBe(1));
  });

  it('removes the channel and clears the pending nudge on unmount', async () => {
    setTrials(['t1']);
    const { unmount } = mount('s1');
    await waitFor(() => expect(bindingFor('entries')).toBeTruthy());
    subscribeCb?.('SUBSCRIBED');
    const channel = lastChannel;

    bindingFor('entries')!.cb({}); // schedules a nudge
    unmount(); // cleanup must clear the timer + remove the channel
    await sleep(PAST_DEBOUNCE_MS);

    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    expect(nudgeCount()).toBe(0);
  });

  it('dispatches a bare event with no payload (the sync writes the cache)', async () => {
    setTrials(['t1']);
    mount('s1');
    await waitFor(() => expect(bindingFor('entries')).toBeTruthy());
    subscribeCb?.('SUBSCRIBED');

    bindingFor('entries')!.cb({});
    await waitFor(() => expect(nudgeCount()).toBe(1));

    const evt = dispatchSpy.mock.calls.find(([e]) => (e as Event).type === SYNC_EVENT)?.[0] as
      | Event
      | undefined;
    expect(evt).toBeInstanceOf(Event);
    expect((evt as CustomEvent).detail).toBeUndefined();
  });
});
