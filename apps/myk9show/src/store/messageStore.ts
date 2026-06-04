import { create } from 'zustand';
import { supabase } from '@/services/database/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Message, MessageThread } from '@/features/messages/types';
import { useToastStore } from '@/store/toastStore';
import { logger } from '@/services/LoggingService';
import { type DbMessage, type DbThread, type DbPerson, initialState } from './messageStore.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase.from.bind(supabase) as (table: string) => any;

interface MessageState {
  threads: MessageThread[];
  messagesByThread: Record<string, Message[]>;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  currentShowIds: string[];
  currentUserId: string | null;
  channels: RealtimeChannel[];
  _subscribing: boolean;

  // Actions
  setCurrentUserId: (userId: string) => void;
  subscribe: (showIds: string[]) => Promise<void>;
  unsubscribe: () => void;
  fetchThreads: (showId: string) => Promise<void>;
  fetchMessages: (threadId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  markThreadRead: (threadId: string) => void;
  sendMessage: (threadId: string, showId: string, body: string) => Promise<void>;
  getOrCreateThread: (showId: string, participantId: string) => Promise<MessageThread | null>;
  recalculateUnread: () => void;
  reset: () => void;
}

export const useMessageStore = create<MessageState>()((set, get) => ({
  ...initialState,

  setCurrentUserId: (userId: string) => {
    set({ currentUserId: userId });
  },

  subscribe: async (showIds: string[]) => {
    // Mutex: prevent concurrent subscribe calls
    if (get()._subscribing) return;
    set({ _subscribing: true });

    try {
      const current = get();

      // Skip if already subscribed to the same shows
      const sorted = [...showIds].sort();
      const currentSorted = [...current.currentShowIds].sort();
      if (JSON.stringify(sorted) === JSON.stringify(currentSorted)) return;

      // Clean up existing channels
      current.unsubscribe();

      if (showIds.length === 0) {
        set({ currentShowIds: [], threads: [], messagesByThread: {}, unreadCount: 0 });
        return;
      }

      set({ isLoading: true, error: null, currentShowIds: showIds });

      try {
        // Fetch initial threads for all shows
        await Promise.all(showIds.map(showId => get().fetchThreads(showId)));

        // Set up realtime channels for each show
        const channels: RealtimeChannel[] = [];

        for (const showId of showIds) {
          const channel = supabase
            .channel(`messages-${showId}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'show_messages',
                filter: `show_id=eq.${showId}`,
              },
              (payload: { new: DbMessage }) => {
                get().addMessage(payload.new as Message);
              }
            )
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'show_messages',
                filter: `show_id=eq.${showId}`,
              },
              (payload: { new: DbMessage }) => {
                const updated = payload.new;
                set(state => {
                  const threadMessages = state.messagesByThread[updated.thread_id] ?? [];
                  const newMessages = threadMessages.map(m =>
                    m.id === updated.id ? { ...m, ...updated } : m
                  );
                  return {
                    messagesByThread: {
                      ...state.messagesByThread,
                      [updated.thread_id]: newMessages,
                    },
                  };
                });
                get().recalculateUnread();
              }
            );

          await channel.subscribe();
          channels.push(channel);
        }

        set({ channels, isLoading: false });
      } catch (err) {
        logger.error('Failed to subscribe to messages:', 'messages', { data: err });
        set({
          error: err instanceof Error ? err.message : 'Failed to load messages',
          isLoading: false,
        });
      }
    } finally {
      set({ _subscribing: false });
    }
  },

  unsubscribe: () => {
    const { channels } = get();
    for (const ch of channels) {
      supabase.removeChannel(ch);
    }
    set({ channels: [], currentShowIds: [] });
  },

  fetchThreads: async (showId: string) => {
    try {
      // Fetch threads (no join — participant_id FK points to auth.users, not people)
      const { data: threadData, error } = (await db('show_message_threads')
        .select('id, show_id, participant_id, last_message_at, created_at')
        .eq('show_id', showId)
        .order('last_message_at', { ascending: false })) as {
        data: DbThread[] | null;
        error: Error | null;
      };

      if (error) throw error;

      const rows = threadData ?? [];

      // Batch-fetch people by auth_user_id (the FK used by participant_id)
      const participantIds = [...new Set(rows.map(r => r.participant_id))];
      const peopleMap = new Map<string, string>();
      if (participantIds.length > 0) {
        const { data: peopleData } = (await db('people')
          .select('auth_user_id, first_name, last_name')
          .in('auth_user_id', participantIds)) as {
          data: DbPerson[] | null;
          error: Error | null;
        };
        for (const p of peopleData ?? []) {
          peopleMap.set(p.auth_user_id, `${p.first_name} ${p.last_name}`.trim());
        }
      }

      const threads: MessageThread[] = rows.map(row => {
        const name = peopleMap.get(row.participant_id);
        const thread: MessageThread = {
          id: row.id,
          show_id: row.show_id,
          participant_id: row.participant_id,
          last_message_at: row.last_message_at,
          created_at: row.created_at,
        };
        if (name !== undefined) thread.participant_name = name;
        return thread;
      });

      set(state => {
        const others = state.threads.filter(t => t.show_id !== showId);
        return { threads: [...others, ...threads] };
      });

      await Promise.all(threads.map(thread => get().fetchMessages(thread.id)));
    } catch (err) {
      logger.error('Failed to fetch threads:', 'messages', { data: err });
    }
  },

  fetchMessages: async (threadId: string) => {
    try {
      // Step 1: Fetch raw messages
      const { data: rawMessages, error } = (await db('show_messages')
        .select('id, show_id, thread_id, sender_id, body, group_label, read_at, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })) as {
        data: DbMessage[] | null;
        error: Error | null;
      };

      if (error) throw error;

      const rows = rawMessages ?? [];

      // Step 2: Batch-fetch sender names from people table using auth_user_id
      const uniqueSenderIds = [...new Set(rows.map(r => r.sender_id))];
      const { data: peopleData } = (await db('people')
        .select('auth_user_id, first_name, last_name')
        .in('auth_user_id', uniqueSenderIds)) as {
        data: DbPerson[] | null;
        error: Error | null;
      };

      const peopleMap = new Map<string, string>();
      for (const p of peopleData ?? []) {
        peopleMap.set(p.auth_user_id, `${p.first_name} ${p.last_name}`.trim());
      }

      // Step 3: Map enriched messages into state
      const enriched: Message[] = rows.map(row => {
        const msg: Message = { ...row };
        const name = peopleMap.get(row.sender_id);
        if (name !== undefined) msg.sender_name = name;
        return msg;
      });

      set(state => ({
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: enriched,
        },
      }));

      // Step 4: Recalculate unread and enrich thread metadata
      get().recalculateUnread();
    } catch (err) {
      logger.error('Failed to fetch messages:', 'messages', { data: err });
    }
  },

  addMessage: (message: Message) => {
    const { currentUserId } = get();

    // Skip unread tracking and toasts if user identity not yet established
    const userKnown = currentUserId !== null;

    set(state => {
      const existing = state.messagesByThread[message.thread_id] ?? [];

      // Dedup: skip if already present
      if (existing.some(m => m.id === message.id)) return state;

      const updated = [...existing, message];
      const isUnread = userKnown && message.read_at === null && message.sender_id !== currentUserId;

      // Update thread metadata inline
      const updatedThreads = state.threads.map(t => {
        if (t.id !== message.thread_id) return t;
        const threadUnread = updated.filter(
          m => m.read_at === null && m.sender_id !== currentUserId
        ).length;
        return {
          ...t,
          last_message_at: message.created_at,
          last_message_preview: message.body.substring(0, 100),
          unread_count: threadUnread,
        };
      });

      return {
        messagesByThread: {
          ...state.messagesByThread,
          [message.thread_id]: updated,
        },
        unreadCount: isUnread ? state.unreadCount + 1 : state.unreadCount,
        threads: updatedThreads,
      };
    });

    // Trigger toast for messages from others (only when user identity is known)
    if (userKnown && message.sender_id !== currentUserId) {
      useToastStore.getState().addToast({
        id: `msg-${message.id}`,
        type: 'announcement',
        title: message.sender_name ?? 'New message',
        body: message.body,
        priority: 'normal',
        timestamp: Date.now(),
      });
    }
  },

  markThreadRead: (threadId: string) => {
    const { currentUserId } = get();
    const now = new Date().toISOString();

    set(state => {
      const messages = state.messagesByThread[threadId] ?? [];
      // Only mark messages from others as read (not own messages)
      const updated = messages.map(m =>
        m.read_at === null && m.sender_id !== currentUserId ? { ...m, read_at: now } : m
      );

      return {
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: updated,
        },
      };
    });

    // Recalculate after optimistic update
    get().recalculateUnread();

    // Persist to DB (fire-and-forget) — only mark messages sent by others
    if (currentUserId) {
      void db('show_messages')
        .update({ read_at: now })
        .eq('thread_id', threadId)
        .is('read_at', null)
        .neq('sender_id', currentUserId)
        .then(({ error }: { error: Error | null }) => {
          if (error) {
            logger.error('Failed to persist markThreadRead:', 'messages', { data: error });
          }
        });
    }
  },

  sendMessage: async (threadId: string, showId: string, body: string) => {
    const { currentUserId } = get();
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const optimistic: Message = {
      id: tempId,
      show_id: showId,
      thread_id: threadId,
      sender_id: currentUserId ?? '',
      body,
      group_label: null,
      read_at: now, // Own message: mark as read
      created_at: now,
    };

    // Optimistic add
    set(state => {
      const existing = state.messagesByThread[threadId] ?? [];
      return {
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: [...existing, optimistic],
        },
      };
    });

    try {
      const { data, error } = (await db('show_messages')
        .insert({
          show_id: showId,
          thread_id: threadId,
          sender_id: currentUserId,
          body,
          group_label: null,
          read_at: null,
        })
        .select('id, show_id, thread_id, sender_id, body, group_label, read_at, created_at')
        .single()) as { data: DbMessage | null; error: Error | null };

      if (error) throw error;
      if (!data) throw new Error('No data returned from insert');

      // Replace optimistic with real message
      set(state => {
        const existing = state.messagesByThread[threadId] ?? [];
        const replaced = existing.map(m => (m.id === tempId ? { ...optimistic, ...data } : m));
        return {
          messagesByThread: {
            ...state.messagesByThread,
            [threadId]: replaced,
          },
        };
      });
    } catch (err) {
      // Rollback on error
      logger.error('Failed to send message:', 'messages', { data: err });
      set(state => {
        const existing = state.messagesByThread[threadId] ?? [];
        return {
          messagesByThread: {
            ...state.messagesByThread,
            [threadId]: existing.filter(m => m.id !== tempId),
          },
        };
      });
      throw err;
    }
  },

  getOrCreateThread: async (showId: string, participantId: string) => {
    try {
      // Try to find existing thread first to avoid resetting last_message_at
      const { data: existing } = (await db('show_message_threads')
        .select('id, show_id, participant_id, last_message_at, created_at')
        .eq('show_id', showId)
        .eq('participant_id', participantId)
        .single()) as { data: DbThread | null; error: Error | null };

      if (existing) {
        const thread: MessageThread = {
          id: existing.id,
          show_id: existing.show_id,
          participant_id: existing.participant_id,
          last_message_at: existing.last_message_at,
          created_at: existing.created_at,
        };
        set(state => {
          if (state.threads.some(t => t.id === thread.id)) return state;
          return { threads: [thread, ...state.threads] };
        });
        return thread;
      }

      // Create new thread
      const { data: created, error } = (await db('show_message_threads')
        .insert({ show_id: showId, participant_id: participantId })
        .select('id, show_id, participant_id, last_message_at, created_at')
        .single()) as { data: DbThread | null; error: Error | null };

      if (error) throw error;
      if (!created) return null;

      const thread: MessageThread = {
        id: created.id,
        show_id: created.show_id,
        participant_id: created.participant_id,
        last_message_at: created.last_message_at,
        created_at: created.created_at,
      };

      // Add to local state if not already present
      set(state => {
        if (state.threads.some(t => t.id === thread.id)) return state;
        return { threads: [thread, ...state.threads] };
      });

      return thread;
    } catch (err) {
      logger.error('Failed to get or create thread:', 'messages', { data: err });
      return null;
    }
  },

  recalculateUnread: () => {
    const { messagesByThread, currentUserId, threads } = get();
    let totalCount = 0;

    const updatedThreads = threads.map(thread => {
      const messages = messagesByThread[thread.id] ?? [];
      const threadUnread = messages.filter(
        m => m.read_at === null && m.sender_id !== currentUserId
      ).length;
      totalCount += threadUnread;

      const lastMessage = messages[messages.length - 1];
      return {
        ...thread,
        unread_count: threadUnread,
        last_message_preview: lastMessage?.body?.substring(0, 100) ?? undefined,
      };
    });

    set({ unreadCount: totalCount, threads: updatedThreads });
  },

  reset: () => {
    get().unsubscribe();
    set({ ...initialState });
  },
}));
