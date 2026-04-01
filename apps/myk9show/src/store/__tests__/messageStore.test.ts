import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMessageStore } from '../messageStore';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn(),
    })),
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
