import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMessageStore } from '../messageStore';

const dbState = vi.hoisted(() => ({
  threads: [] as Array<{
    id: string;
    show_id: string;
    participant_id: string;
    last_message_at: string;
    created_at: string;
  }>,
  messages: [] as Array<{
    id: string;
    show_id: string;
    thread_id: string;
    sender_id: string;
    body: string;
    group_label: string | null;
    read_at: string | null;
    created_at: string;
  }>,
  people: [] as Array<{
    auth_user_id: string;
    first_name: string;
    last_name: string;
  }>,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters[column] = value;
          return query;
        }),
        is: vi.fn(() => query),
        neq: vi.fn(() => query),
        order: vi.fn(() => query),
        in: vi.fn((column: string, values: unknown[]) => {
          inFilters[column] = values;
          return query;
        }),
        upsert: vi.fn(() => query),
        insert: vi.fn(() => query),
        update: vi.fn(() => query),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (
          onFulfilled: (value: { data: unknown[] | null; error: Error | null }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => {
          const data =
            table === 'show_message_threads'
              ? dbState.threads.filter(thread => thread.show_id === filters.show_id)
              : table === 'show_messages'
                ? dbState.messages.filter(message => {
                    if (filters.thread_id) return message.thread_id === filters.thread_id;
                    const threadIds = inFilters.thread_id;
                    if (threadIds) return threadIds.includes(message.thread_id);
                    return true;
                  })
                : table === 'people'
                  ? dbState.people
                  : [];
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return query;
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ status: 'SUBSCRIBED' }),
    })),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('messageStore', () => {
  beforeEach(() => {
    dbState.threads = [];
    dbState.messages = [];
    dbState.people = [];
    useMessageStore.getState().reset();
  });

  describe('initial state', () => {
    it('starts with empty threads and messages', () => {
      const state = useMessageStore.getState();
      expect(state.threads).toEqual([]);
      expect(state.messagesByThread).toEqual({});
      expect(state.unreadCount).toBe(0);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('appends a message to the correct thread', () => {
      const { addMessage } = useMessageStore.getState();
      addMessage({
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      const state = useMessageStore.getState();
      expect(state.messagesByThread['thread-1']).toHaveLength(1);
      expect(state.messagesByThread['thread-1'][0].body).toBe('Hello');
    });

    it('does not add duplicate messages', () => {
      const { addMessage } = useMessageStore.getState();
      const msg = {
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      addMessage(msg);
      addMessage(msg);

      expect(useMessageStore.getState().messagesByThread['thread-1']).toHaveLength(1);
    });

    it('increments unread count for messages from others', () => {
      const { addMessage, setCurrentUserId } = useMessageStore.getState();
      setCurrentUserId('user-1');

      addMessage({
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      expect(useMessageStore.getState().unreadCount).toBe(1);
    });

    it('does not increment unread for own messages', () => {
      const { addMessage, setCurrentUserId } = useMessageStore.getState();
      setCurrentUserId('user-1');

      addMessage({
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-1',
        body: 'My message',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      expect(useMessageStore.getState().unreadCount).toBe(0);
    });
  });

  describe('markThreadRead', () => {
    it('sets read_at on all unread messages in thread and decrements unread count', () => {
      const { addMessage, markThreadRead, setCurrentUserId } = useMessageStore.getState();
      setCurrentUserId('user-1');

      addMessage({
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });
      addMessage({
        id: 'msg-2',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'World',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      expect(useMessageStore.getState().unreadCount).toBe(2);

      markThreadRead('thread-1');

      const state = useMessageStore.getState();
      expect(state.unreadCount).toBe(0);
      expect(state.messagesByThread['thread-1'].every(m => m.read_at !== null)).toBe(true);
    });
  });

  describe('fetchThreads', () => {
    it('hydrates messages so subscribed inbox unread counts are available immediately', async () => {
      const now = new Date().toISOString();
      dbState.threads = [
        {
          id: 'thread-1',
          show_id: 'show-1',
          participant_id: 'user-2',
          last_message_at: now,
          created_at: now,
        },
      ];
      dbState.messages = [
        {
          id: 'msg-1',
          show_id: 'show-1',
          thread_id: 'thread-1',
          sender_id: 'user-2',
          body: 'Please confirm your armband.',
          group_label: null,
          read_at: null,
          created_at: now,
        },
        {
          id: 'msg-2',
          show_id: 'show-1',
          thread_id: 'thread-1',
          sender_id: 'user-1',
          body: 'I will check.',
          group_label: null,
          read_at: null,
          created_at: now,
        },
      ];

      const { fetchThreads, setCurrentUserId } = useMessageStore.getState();
      setCurrentUserId('user-1');
      await fetchThreads('show-1');

      const state = useMessageStore.getState();
      expect(state.unreadCount).toBe(1);
      expect(state.threads[0].unread_count).toBe(1);
      expect(state.threads[0].last_message_preview).toBe('I will check.');
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const { addMessage, reset } = useMessageStore.getState();
      addMessage({
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      reset();

      const state = useMessageStore.getState();
      expect(state.threads).toEqual([]);
      expect(state.messagesByThread).toEqual({});
      expect(state.unreadCount).toBe(0);
    });
  });
});
