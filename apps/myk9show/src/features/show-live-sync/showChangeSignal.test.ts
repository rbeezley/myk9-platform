import { describe, expect, it, vi } from 'vitest';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  createShowChangeSignalRegistry,
  showChangesTopic,
  type ShowChangeSignal,
} from './showChangeSignal';

type BroadcastHandler = (message: { payload: unknown }) => void;
type StatusHandler = (status: string) => void;

interface FakeChannel {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  emit: (payload: unknown) => void;
  setStatus: (status: string) => void;
}

function createClient() {
  const channels: FakeChannel[] = [];
  const removeResolvers: Array<() => void> = [];
  const channel = vi.fn(() => {
    let broadcastHandler: BroadcastHandler | undefined;
    let statusHandler: StatusHandler | undefined;
    const fake: FakeChannel = {
      on: vi.fn((_kind, _filter, handler: BroadcastHandler) => {
        broadcastHandler = handler;
        return fake;
      }),
      subscribe: vi.fn((handler: StatusHandler) => {
        statusHandler = handler;
        return fake;
      }),
      emit: payload => broadcastHandler?.({ payload }),
      setStatus: status => statusHandler?.(status),
    };
    channels.push(fake);
    return fake as unknown as RealtimeChannel;
  });
  const removeChannel = vi.fn(
    () =>
      new Promise<'ok'>(resolve => {
        removeResolvers.push(() => resolve('ok'));
      })
  );

  return {
    client: { channel, removeChannel } as unknown as Pick<
      SupabaseClient,
      'channel' | 'removeChannel'
    >,
    channel,
    channels,
    removeChannel,
    resolveRemoval: () => removeResolvers.shift()?.(),
  };
}

describe('showChangeSignal', () => {
  it('formats the private show topic and subscribes to the minimal event contract', () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);

    registry.subscribe('4584f257-19b5-4016-aae6-5e7827b769cb', vi.fn());

    expect(showChangesTopic('4584f257-19b5-4016-aae6-5e7827b769cb')).toBe(
      'show:4584f257-19b5-4016-aae6-5e7827b769cb:changes'
    );
    expect(fake.channel).toHaveBeenCalledWith('show:4584f257-19b5-4016-aae6-5e7827b769cb:changes', {
      config: { private: true },
    });
    expect(fake.channels[0].on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'showday_change' },
      expect.any(Function)
    );
  });

  it('fans one valid signal out to every consumer through one channel', () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);
    const first = vi.fn();
    const second = vi.fn();

    registry.subscribe('show-1', first);
    registry.subscribe('show-1', second);
    fake.channels[0].emit({ table: 'entries' } satisfies ShowChangeSignal);
    fake.channels[0].emit({ table: 'entries', id: 'must-not-pass' });
    fake.channels[0].emit({ table: 'dogs' });

    expect(fake.channel).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledWith({ table: 'entries' });
    expect(second).toHaveBeenCalledOnce();
  });

  it('removes the shared channel only after the final consumer unsubscribes', () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);
    const unsubscribeFirst = registry.subscribe('show-1', vi.fn());
    const unsubscribeSecond = registry.subscribe('show-1', vi.fn());

    unsubscribeFirst();
    expect(fake.removeChannel).not.toHaveBeenCalled();

    unsubscribeSecond();
    expect(fake.removeChannel).toHaveBeenCalledOnce();
    expect(fake.removeChannel).toHaveBeenCalledWith(fake.channels[0]);
  });

  it('does not let old asynchronous cleanup disconnect a rapid re-subscription', async () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);
    const unsubscribe = registry.subscribe('show-1', vi.fn());
    unsubscribe();

    const listener = vi.fn();
    registry.subscribe('show-1', listener);
    fake.resolveRemoval();
    await Promise.resolve();
    fake.channels[1].emit({ table: 'classes' });

    expect(fake.channel).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith({ table: 'classes' });
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('reports connection state to every registered status listener', () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);
    const firstStatus = vi.fn();
    const secondStatus = vi.fn();

    registry.subscribe('show-1', vi.fn(), firstStatus);
    registry.subscribe('show-1', vi.fn(), secondStatus);
    fake.channels[0].setStatus('SUBSCRIBED');
    fake.channels[0].setStatus('CHANNEL_ERROR');

    expect(firstStatus.mock.calls).toEqual([['SUBSCRIBED'], ['CHANNEL_ERROR']]);
    expect(secondStatus.mock.calls).toEqual([['SUBSCRIBED'], ['CHANNEL_ERROR']]);
  });

  it('replays the current channel status to a consumer that mounts later', () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);
    registry.subscribe('show-1', vi.fn(), vi.fn());
    fake.channels[0].setStatus('SUBSCRIBED');

    const lateStatus = vi.fn();
    registry.subscribe('show-1', vi.fn(), lateStatus);

    expect(lateStatus).toHaveBeenCalledWith('SUBSCRIBED');
  });
});
