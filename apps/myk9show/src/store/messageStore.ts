import { create } from 'zustand';
import { supabase } from '@/services/database/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Message, MessageThread } from '@/features/messages/types';
import { useToastStore } from '@/store/toastStore';
import { logger } from '@/services/LoggingService';

// Raw DB row shapes for tables not yet in the generated Supabase types
interface DbMessage {
  id: string;
  show_id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  group_label: string | null;
  read_at: string | null;
  created_at: string;
}

interface DbThread {
  id: string;
  show_id: string;
  participant_id: string;
  last_message_at: string;
  created_at: string;
}

interface DbPerson {
  id: string;
  full_name: string;
  role: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase.from as (table: string) => any;

interface MessageState {
  threads: MessageThread[];
  messagesByThread: Record<string, Message[]>;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  currentShowIds: string[];
  currentUserId: string | null;
  channels: RealtimeChannel[];

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

const initialState = {
  threads: [] as MessageThread[],
  messagesByThread: {} as Record<string, Message[]>,
  unreadCount: 0,
  isLoading: false,
  error: null as string | null,
  currentShowIds: [] as string[],
  currentUserId: null as string | null,
  channels: [] as RealtimeChannel[],
};

export const useMessageStore = create<MessageState>()((set, get) => ({
  ...initialState,

  setCurrentUserId: (userId: string) => {
    set({ currentUserId: userId });
  },

  subscribe: async (showIds: string[]) => {
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
      // Try join first
      const { data, error } = (await db('show_message_threads')
        .select(
          `
          id,
          show_id,
          participant_id,
          last_message_at,
          created_at,
          people:participant_id (
            full_name,
            role
          ),
          shows:show_id (
            name
          )
        `
        )
        .eq('show_id', showId)
        .order('last_message_at', { ascending: false })) as {
        data: Array<
          DbThread & {
            people: { full_name: string; role: string } | null;
            shows: { name: string } | null;
          }
        > | null;
        error: Error | null;
      };

      if (error) throw error;

      const threads: MessageThread[] = (data ?? []).map(row => ({
        id: row.id,
        show_id: row.show_id,
        participant_id: row.participant_id,
        last_message_at: row.last_message_at,
        created_at: row.created_at,
        participant_name: row.people?.full_name ?? undefined,
        participant_role: row.people?.role ?? undefined,
        show_name: row.shows?.name ?? undefined,
      })) as MessageThread[];

      set(state => {
        const others = state.threads.filter(t => t.show_id !== showId);
        return { threads: [...others, ...threads] };
      });
    } catch (err) {
      logger.error('Failed to fetch threads (join):', 'messages', { data: err });

      // Fallback: separate queries
      try {
        const { data: threadData, error: threadError } = (await db('show_message_threads')
          .select('id, show_id, participant_id, last_message_at, created_at')
          .eq('show_id', showId)
          .order('last_message_at', { ascending: false })) as {
          data: DbThread[] | null;
          error: Error | null;
        };

        if (threadError) throw threadError;

        const rows = threadData ?? [];
        const participantIds = [...new Set(rows.map(r => r.participant_id))];

        const { data: peopleData } = (await db('people')
          .select('id, full_name, role')
          .in('id', participantIds)) as { data: DbPerson[] | null; error: Error | null };

        const peopleMap = new Map((peopleData ?? []).map(p => [p.id, p]));

        const threads: MessageThread[] = rows.map(row => {
          const person = peopleMap.get(row.participant_id);
          return {
            id: row.id,
            show_id: row.show_id,
            participant_id: row.participant_id,
            last_message_at: row.last_message_at,
            created_at: row.created_at,
            participant_name: person?.full_name ?? undefined,
            participant_role: person?.role ?? undefined,
          } as MessageThread;
        });

        set(state => {
          const others = state.threads.filter(t => t.show_id !== showId);
          return { threads: [...others, ...threads] };
        });
      } catch (fallbackErr) {
        logger.error('Fallback fetchThreads also failed:', 'messages', { data: fallbackErr });
      }
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

      // Step 2: Batch-fetch sender names from people table using unique sender_ids
      const uniqueSenderIds = [...new Set(rows.map(r => r.sender_id))];
      const { data: peopleData } = (await db('people')
        .select('id, full_name, role')
        .in('id', uniqueSenderIds)) as { data: DbPerson[] | null; error: Error | null };

      const peopleMap = new Map((peopleData ?? []).map(p => [p.id, p]));

      // Step 3: Map enriched messages into state
      const enriched: Message[] = rows.map(row => {
        const person = peopleMap.get(row.sender_id);
        return {
          ...row,
          sender_name: person?.full_name ?? undefined,
          sender_role: person?.role ?? undefined,
        } as Message;
      });

      set(state => ({
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: enriched,
        },
      }));

      // Step 4: Recalculate unread
      get().recalculateUnread();
    } catch (err) {
      logger.error('Failed to fetch messages:', 'messages', { data: err });
    }
  },

  addMessage: (message: Message) => {
    const { currentUserId } = get();

    set(state => {
      const existing = state.messagesByThread[message.thread_id] ?? [];

      // Dedup: skip if already present
      if (existing.some(m => m.id === message.id)) return state;

      const updated = [...existing, message];
      const isFromOther = message.sender_id !== currentUserId;
      const isUnread = message.read_at === null && isFromOther;

      return {
        messagesByThread: {
          ...state.messagesByThread,
          [message.thread_id]: updated,
        },
        unreadCount: isUnread ? state.unreadCount + 1 : state.unreadCount,
      };
    });

    // Trigger toast for messages from others
    if (message.sender_id !== currentUserId) {
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
    const now = new Date().toISOString();

    set(state => {
      const messages = state.messagesByThread[threadId] ?? [];
      const updated = messages.map(m => (m.read_at === null ? { ...m, read_at: now } : m));

      return {
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: updated,
        },
      };
    });

    // Recalculate after optimistic update
    get().recalculateUnread();

    // Persist to DB (fire-and-forget)
    void db('show_messages')
      .update({ read_at: now })
      .eq('thread_id', threadId)
      .is('read_at', null)
      .then(({ error }: { error: Error | null }) => {
        if (error) {
          logger.error('Failed to persist markThreadRead:', 'messages', { data: error });
        }
      });
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
      const { data, error } = (await db('show_message_threads')
        .upsert(
          { show_id: showId, participant_id: participantId },
          { onConflict: 'show_id,participant_id', ignoreDuplicates: false }
        )
        .select('id, show_id, participant_id, last_message_at, created_at')
        .single()) as { data: DbThread | null; error: Error | null };

      if (error) throw error;
      if (!data) return null;

      const thread: MessageThread = {
        id: data.id,
        show_id: data.show_id,
        participant_id: data.participant_id,
        last_message_at: data.last_message_at,
        created_at: data.created_at,
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
    const { messagesByThread, currentUserId } = get();
    let count = 0;
    for (const messages of Object.values(messagesByThread)) {
      for (const msg of messages) {
        if (msg.read_at === null && msg.sender_id !== currentUserId) {
          count++;
        }
      }
    }
    set({ unreadCount: count });
  },

  reset: () => {
    get().unsubscribe();
    set({ ...initialState });
  },
}));
