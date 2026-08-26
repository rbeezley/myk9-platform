import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMessageSubscription } from '../useMessageSubscription';
import { useMessageStore } from '@/store/messageStore';
import { supabase } from '@/services/database/supabaseClient';
import type { DbMessage, DbPerson, DbThread } from '@/store/messageStore.types';

const { readThreads, readPeople, readMessages } = vi.hoisted(() => ({
  readThreads: vi.fn(async (): Promise<{ data: DbThread[]; error: null }> => ({
    data: [],
    error: null,
  })),
  readPeople: vi.fn(async (): Promise<{ data: DbPerson[]; error: null }> => ({
    data: [],
    error: null,
  })),
  readMessages: vi.fn(async (): Promise<{ data: DbMessage[]; error: null }> => ({
    data: [],
    error: null,
  })),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({ order: readThreads }),
        in: () => (table === 'people' ? readPeople() : { order: readMessages }),
      }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

const auth = {
  user: { id: 'auth-user-1' },
  userWithRoles: { id: 'auth-user-1', roles: ['exhibitor'], scopes: [] },
  isSecretary: false,
  isAdmin: false,
  hasRole: () => false,
};
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth }));

let activeShows = [{ showId: 'show-1' }];
vi.mock('@/hooks/queries/useShowDayData', () => ({
  useShowDayData: () => ({ activeShows }),
}));

const showState = { selectedShowId: null, shows: [] };
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (state: typeof showState) => unknown) => selector(showState),
}));
const entryState = { entries: [] };
vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector: (state: typeof entryState) => unknown) => selector(entryState),
}));
const dogState = { dogs: [] };
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: () => dogState }));

async function waitForSubscription() {
  await waitFor(() => expect(useMessageStore.getState()._subscribing).toBe(false));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(fulfill => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

const timestamp = '2026-08-26T00:00:00.000Z';
const thread: DbThread = {
  id: 'thread-1',
  show_id: 'show-1',
  participant_id: 'participant-1',
  last_message_at: timestamp,
  created_at: timestamp,
};
const message: DbMessage = {
  id: 'message-1',
  show_id: 'show-1',
  thread_id: 'thread-1',
  sender_id: 'participant-1',
  body: 'Original message',
  group_label: null,
  read_at: null,
  created_at: timestamp,
};

describe('message subscription request ownership', () => {
  beforeEach(() => {
    useMessageStore.getState().reset();
    vi.clearAllMocks();
    readThreads.mockReset().mockResolvedValue({ data: [], error: null });
    readPeople.mockReset().mockResolvedValue({ data: [], error: null });
    readMessages.mockReset().mockResolvedValue({ data: [], error: null });
    activeShows = [{ showId: 'show-1' }];
  });

  it('keeps one thread query and live channel across five same-show replica updates', async () => {
    const { rerender, unmount } = renderHook(() => useMessageSubscription());
    await waitForSubscription();
    act(() => window.dispatchEvent(new Event('online')));
    for (let update = 0; update < 5; update += 1) {
      activeShows = [{ showId: 'show-1' }];
      rerender();
      await waitForSubscription();
    }

    expect(supabase.from).toHaveBeenCalledExactlyOnceWith('show_message_threads');
    expect(supabase.channel).toHaveBeenCalledExactlyOnceWith('messages-show-1');
    expect(supabase.removeChannel).not.toHaveBeenCalled();
    expect(useMessageStore.getState().channels).toHaveLength(1);
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(useMessageStore.getState().channels).toEqual([]);
  });

  it.each(['online', 'replica'] as const)(
    'recovers failed initial hydration on %s without restarting a healthy subscription',
    async trigger => {
      readThreads.mockRejectedValueOnce(new Error('Temporary transport failure'));
      const { rerender, unmount } = renderHook(() => useMessageSubscription());
      await waitForSubscription();
      expect(useMessageStore.getState().error).toBe('Failed to load message threads');
      expect(readThreads).toHaveBeenCalledTimes(1);
      readThreads.mockResolvedValueOnce({ data: [thread], error: null });
      readMessages.mockResolvedValueOnce({ data: [message], error: null });

      const retry = () => {
        if (trigger === 'online') act(() => window.dispatchEvent(new Event('online')));
        else {
          activeShows = [{ showId: 'show-1' }];
          rerender();
        }
      };
      retry();
      await waitForSubscription();
      expect(useMessageStore.getState().threads[0]?.id).toBe('thread-1');
      expect(useMessageStore.getState().messagesByThread['thread-1']).toEqual([message]);
      expect(useMessageStore.getState().error).toBeNull();
      retry();
      expect(readThreads).toHaveBeenCalledTimes(2);
      unmount();
      act(() => window.dispatchEvent(new Event('online')));
      expect(readThreads).toHaveBeenCalledTimes(2);
    }
  );

  it('still replaces the channel and fetches threads for a different show', async () => {
    const { rerender } = renderHook(() => useMessageSubscription());
    await waitForSubscription();
    activeShows = [{ showId: 'show-2' }];
    rerender();
    await waitForSubscription();

    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(supabase.channel).toHaveBeenLastCalledWith('messages-show-2');
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(useMessageStore.getState().currentShowIds).toEqual(['show-2']);
    expect(useMessageStore.getState().channels).toHaveLength(1);
  });

  it('deduplicates recovery events while a retry is pending', async () => {
    readThreads.mockRejectedValueOnce(new Error('Temporary transport failure'));
    const { rerender } = renderHook(() => useMessageSubscription());
    await waitForSubscription();
    const retry = deferred<{ data: DbThread[]; error: null }>();
    readThreads.mockImplementationOnce(() => retry.promise);
    act(() => window.dispatchEvent(new Event('online')));
    const recovery = useMessageStore.getState().subscribe(['show-1']);
    for (let update = 0; update < 5; update += 1) {
      act(() => window.dispatchEvent(new Event('online')));
      activeShows = [{ showId: 'show-1' }];
      rerender();
    }
    expect(readThreads).toHaveBeenCalledTimes(2);
    await act(async () => {
      retry.resolve({ data: [], error: null });
      await recovery;
    });
    expect(useMessageStore.getState().error).toBeNull();
    expect(useMessageStore.getState().channels).toHaveLength(1);
  });

  it('retries the current store scope instead of narrowing a page-owned subscription', async () => {
    renderHook(() => useMessageSubscription());
    await waitForSubscription();
    readThreads.mockRejectedValueOnce(new Error('Temporary transport failure'));
    await act(async () => {
      await useMessageStore.getState().subscribe(['page-show']);
    });
    expect(useMessageStore.getState().error).toBe('Failed to load message threads');
    act(() => window.dispatchEvent(new Event('online')));
    await waitForSubscription();
    expect(useMessageStore.getState().currentShowIds).toEqual(['page-show']);
    expect(supabase.channel).toHaveBeenLastCalledWith('messages-page-show');
    expect(useMessageStore.getState().error).toBeNull();
  });

  it('applies the latest show membership without waiting for an older fetch', async () => {
    const older = deferred<{ data: DbThread[]; error: null }>();
    readThreads.mockImplementationOnce(() => older.promise);
    const { rerender } = renderHook(() => useMessageSubscription());
    const oldSubscription = useMessageStore.getState().subscribe(['show-1']);
    activeShows = [{ showId: 'show-2' }];
    rerender();
    await waitForSubscription();
    expect(useMessageStore.getState().currentShowIds).toEqual(['show-2']);
    await act(async () => {
      older.resolve({ data: [], error: null });
      await oldSubscription;
    });
    expect(useMessageStore.getState().currentShowIds).toEqual(['show-2']);
    expect(supabase.channel).toHaveBeenCalledExactlyOnceWith('messages-show-2');
  });

  it('does not install a stale channel after unmount during the initial fetch', async () => {
    const older = deferred<{ data: DbThread[]; error: null }>();
    readThreads.mockImplementationOnce(() => older.promise);
    const { unmount } = renderHook(() => useMessageSubscription());
    const oldSubscription = useMessageStore.getState().subscribe(['show-1']);
    unmount();
    older.resolve({ data: [], error: null });
    await oldSubscription;

    expect(supabase.channel).not.toHaveBeenCalled();
    expect(useMessageStore.getState().channels).toEqual([]);
  });

  it('shares identical pending requests and does not let old completion clear newer busy state', async () => {
    const older = deferred<{ data: DbThread[]; error: null }>();
    const newer = deferred<{ data: DbThread[]; error: null }>();
    readThreads
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const subscribe = useMessageStore.getState().subscribe;
    const first = subscribe(['show-1']);
    expect(subscribe(['show-1', 'show-1'])).toBe(first);
    const second = subscribe(['show-2']);
    older.resolve({ data: [], error: null });
    await first;

    expect(useMessageStore.getState()._subscribing).toBe(true);
    expect(useMessageStore.getState().currentShowIds).toEqual(['show-2']);
    expect(supabase.channel).not.toHaveBeenCalled();
    newer.resolve({ data: [], error: null });
    await second;
    expect(readThreads).toHaveBeenCalledTimes(2);
    expect(supabase.channel).toHaveBeenCalledExactlyOnceWith('messages-show-2');
    expect(useMessageStore.getState()._subscribing).toBe(false);
  });

  it.each(['threads', 'people', 'messages'] as const)(
    'ignores an obsolete %s response and preserves the new subscription',
    async stage => {
      const response = deferred<void>();
      readThreads.mockResolvedValueOnce({ data: [thread], error: null });
      readPeople.mockResolvedValueOnce({
        data: [{ auth_user_id: 'participant-1', first_name: 'Test', last_name: 'Person' }],
        error: null,
      });
      readMessages.mockResolvedValueOnce({ data: [message], error: null });
      const reader = { threads: readThreads, people: readPeople, messages: readMessages }[stage];
      // Hold exactly the requested transport stage, while keeping all query paths functional.
      if (stage === 'threads') {
        readThreads
          .mockReset()
          .mockImplementationOnce(async () => {
            await response.promise;
            return { data: [thread], error: null };
          })
          .mockResolvedValue({ data: [], error: null });
      } else if (stage === 'people') {
        readPeople.mockReset().mockImplementationOnce(async () => {
          await response.promise;
          return { data: [], error: null };
        });
      } else {
        readMessages.mockReset().mockImplementationOnce(async () => {
          await response.promise;
          return { data: [message], error: null };
        });
      }
      const oldSubscription = useMessageStore.getState().subscribe(['show-1']);
      await waitFor(() => expect(reader).toHaveBeenCalledTimes(1));
      await useMessageStore.getState().subscribe(['show-2']);
      response.resolve();
      await oldSubscription;

      expect(useMessageStore.getState().threads).toEqual([]);
      expect(useMessageStore.getState().messagesByThread).toEqual({});
      expect(useMessageStore.getState().unreadCount).toBe(0);
      expect(useMessageStore.getState().currentShowIds).toEqual(['show-2']);
      expect(supabase.channel).toHaveBeenCalledExactlyOnceWith('messages-show-2');
    }
  );

  it('keeps live inserts/updates working but ignores callbacks from a removed channel', async () => {
    await useMessageStore.getState().subscribe(['show-1']);
    const channel = vi.mocked(supabase.channel).mock.results[0]!.value;
    const insert = channel.on.mock.calls[0][2] as (payload: { new: DbMessage }) => void;
    const update = channel.on.mock.calls[1][2] as (payload: { new: DbMessage }) => void;
    insert({ new: message });
    update({ new: { ...message, body: 'Live update' } });
    expect(useMessageStore.getState().messagesByThread['thread-1'][0].body).toBe('Live update');

    useMessageStore.getState().unsubscribe();
    insert({ new: { ...message, id: 'stale-message' } });
    update({ new: { ...message, body: 'Obsolete update' } });
    expect(useMessageStore.getState().messagesByThread['thread-1']).toEqual([
      { ...message, body: 'Live update' },
    ]);
  });
});
