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
  const setAuth = vi.fn().mockResolvedValue(undefined);

  return {
    client: { channel, removeChannel, realtime: { setAuth } } as unknown as Pick<
      SupabaseClient,
      'channel' | 'removeChannel' | 'realtime'
    >,
    channel,
    channels,
    removeChannel,
    setAuth,
    resolveRemoval: () => removeResolvers.shift()?.(),
  };
}

const finishRealtimeAuth = () => Promise.resolve();

describe('showChangeSignal', () => {
  it('authenticates Realtime before joining the private show topic', async () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);

    registry.subscribe('4584f257-19b5-4016-aae6-5e7827b769cb', vi.fn());
    expect(fake.setAuth).toHaveBeenCalledOnce();
    expect(fake.channel).not.toHaveBeenCalled();
    await finishRealtimeAuth();

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

  it('accepts database Broadcast ids and fans normalized signals out to every consumer', async () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);
    const first = vi.fn();
    const second = vi.fn();

    registry.subscribe('show-1', first);
    registry.subscribe('show-1', second);
    await finishRealtimeAuth();
    fake.channels[0].emit({ table: 'entries' } satisfies ShowChangeSignal);
    fake.channels[0].emit({
      table: 'classes',
      id: 'scope:c54ff90a-a859-40d8-b7e7-54d7b57601a3',
    });
    fake.channels[0].emit({
      table: 'classes',
      id: 'reconcile:c54ff90a-a859-40d8-b7e7-54d7b57601a3',
    });
    fake.channels[0].emit({ table: 'entries', id: 'legacy-row-id' });
    fake.channels[0].emit({ table: 'paperwork_prints' });
    fake.channels[0].emit({ table: 'entries', id: 7 });
    fake.channels[0].emit({ table: 'dogs' });

    expect(fake.channel).toHaveBeenCalledTimes(1);
    expect(first.mock.calls).toEqual([
      [{ table: 'entries' }],
      [
        {
          table: 'classes',
          classIds: ['c54ff90a-a859-40d8-b7e7-54d7b57601a3'],
        },
      ],
      [{ table: 'classes', id: 'c54ff90a-a859-40d8-b7e7-54d7b57601a3' }],
      [{ table: 'entries' }],
      [{ table: 'paperwork_prints' }],
    ]);
    expect(second.mock.calls).toEqual([
      [{ table: 'entries' }],
      [
        {
          table: 'classes',
          classIds: ['c54ff90a-a859-40d8-b7e7-54d7b57601a3'],
        },
      ],
      [{ table: 'classes', id: 'c54ff90a-a859-40d8-b7e7-54d7b57601a3' }],
      [{ table: 'entries' }],
      [{ table: 'paperwork_prints' }],
    ]);
  });

  it('removes the shared channel only after the final consumer unsubscribes', async () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);
    const unsubscribeFirst = registry.subscribe('show-1', vi.fn());
    const unsubscribeSecond = registry.subscribe('show-1', vi.fn());
    await finishRealtimeAuth();

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
    await finishRealtimeAuth();
    fake.channels[0].emit({ table: 'classes' });

    expect(fake.channel).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ table: 'classes' });
    expect(fake.removeChannel).not.toHaveBeenCalled();
  });

  it('reports connection state to every registered status listener', async () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);
    const firstStatus = vi.fn();
    const secondStatus = vi.fn();

    registry.subscribe('show-1', vi.fn(), firstStatus);
    registry.subscribe('show-1', vi.fn(), secondStatus);
    await finishRealtimeAuth();
    fake.channels[0].setStatus('SUBSCRIBED');
    fake.channels[0].setStatus('CHANNEL_ERROR');

    expect(firstStatus.mock.calls).toEqual([['SUBSCRIBED'], ['CHANNEL_ERROR']]);
    expect(secondStatus.mock.calls).toEqual([['SUBSCRIBED'], ['CHANNEL_ERROR']]);
  });

  it('replays the current channel status to a consumer that mounts later', async () => {
    const fake = createClient();
    const registry = createShowChangeSignalRegistry(fake.client);
    registry.subscribe('show-1', vi.fn(), vi.fn());
    await finishRealtimeAuth();
    fake.channels[0].setStatus('SUBSCRIBED');

    const lateStatus = vi.fn();
    registry.subscribe('show-1', vi.fn(), lateStatus);

    expect(lateStatus).toHaveBeenCalledWith('SUBSCRIBED');
  });
});
