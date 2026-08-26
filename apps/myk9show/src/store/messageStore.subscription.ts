import type { StoreApi } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
import type { DbMessage, MessageState } from './messageStore.types';

export function createMessageSubscriptions(
  set: StoreApi<MessageState>['setState'],
  get: StoreApi<MessageState>['getState']
): Pick<MessageState, 'subscribe' | 'unsubscribe'> {
  let generation = 0;
  let pending: { key: string; task: Promise<void> } | undefined;

  const unsubscribe = () => {
    generation += 1;
    pending = undefined;
    for (const channel of get().channels) supabase.removeChannel(channel);
    set({ channels: [], currentShowIds: [], _subscribing: false, isLoading: false });
  };

  const subscribe = (showIds: string[]): Promise<void> => {
    const ids = [...new Set(showIds)].sort();
    const key = JSON.stringify(ids);
    if (pending?.key === key) return pending.task;
    if (!pending && !get().error && key === JSON.stringify([...get().currentShowIds].sort())) {
      return Promise.resolve();
    }

    unsubscribe();
    const owner = generation;
    const isCurrent = () => owner === generation;
    if (ids.length === 0) {
      set({ threads: [], messagesByThread: {}, unreadCount: 0 });
      return Promise.resolve();
    }
    set({ isLoading: true, error: null, currentShowIds: ids, _subscribing: true });

    // Changed membership must not wait behind an obsolete network request. Its
    // results and callbacks lose ownership immediately, even if transport stalls.
    const task = (async () => {
      const channels: RealtimeChannel[] = [];
      try {
        const hydrated = await Promise.all(
          ids.map(showId => get().fetchThreads(showId, isCurrent))
        );
        if (!isCurrent()) return;

        for (const showId of ids) {
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
                if (isCurrent()) get().addMessage(payload.new);
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
                if (!isCurrent()) return;
                const updated = payload.new;
                set(state => ({
                  messagesByThread: {
                    ...state.messagesByThread,
                    [updated.thread_id]: (state.messagesByThread[updated.thread_id] ?? []).map(m =>
                      m.id === updated.id ? { ...m, ...updated } : m
                    ),
                  },
                }));
                get().recalculateUnread();
              }
            );
          channels.push(channel);
          channel.subscribe();
        }
        set({
          channels,
          isLoading: false,
          error: hydrated.every(Boolean) ? null : 'Failed to load message threads',
        });
      } catch (err) {
        for (const channel of channels) supabase.removeChannel(channel);
        if (!isCurrent()) return;
        logger.error('Failed to subscribe to messages:', 'messages', { data: err });
        set({
          error: err instanceof Error ? err.message : 'Failed to load messages',
          isLoading: false,
        });
      } finally {
        if (isCurrent()) {
          pending = undefined;
          set({ _subscribing: false });
        }
      }
    })();
    pending = { key, task };
    return task;
  };

  return { subscribe, unsubscribe };
}
