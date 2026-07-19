import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/services/database/supabaseClient';

export const SHOWDAY_CHANGE_EVENT = 'showday_change';

export type ShowChangeTable = 'entries' | 'classes';

export interface ShowChangeSignal {
  table: ShowChangeTable;
}

export type ShowChangeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';
export type ShowChangeListener = (signal: ShowChangeSignal) => void;
export type ShowChangeStatusListener = (status: ShowChangeStatus) => void;

type ShowChangeClient = Pick<SupabaseClient, 'channel' | 'removeChannel'>;

interface RegistryEntry {
  channel: RealtimeChannel;
  listeners: Set<ShowChangeListener>;
  statusListeners: Set<ShowChangeStatusListener>;
  status?: ShowChangeStatus;
}

export function showChangesTopic(showId: string): string {
  return `show:${showId}:changes`;
}

function isShowChangeSignal(value: unknown): value is ShowChangeSignal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 && (record.table === 'entries' || record.table === 'classes')
  );
}

export function createShowChangeSignalRegistry(client: ShowChangeClient) {
  const entries = new Map<string, RegistryEntry>();

  const subscribe = (
    showId: string,
    listener: ShowChangeListener,
    statusListener?: ShowChangeStatusListener
  ): (() => void) => {
    let entry = entries.get(showId);

    if (!entry) {
      const listeners = new Set<ShowChangeListener>();
      const statusListeners = new Set<ShowChangeStatusListener>();
      const channel = client.channel(showChangesTopic(showId), { config: { private: true } });
      const createdEntry: RegistryEntry = { channel, listeners, statusListeners };
      entry = createdEntry;
      entries.set(showId, createdEntry);

      channel
        .on('broadcast', { event: SHOWDAY_CHANGE_EVENT }, message => {
          if (!isShowChangeSignal(message.payload)) return;
          for (const currentListener of listeners) currentListener(message.payload);
        })
        .subscribe(status => {
          const currentStatus = status as ShowChangeStatus;
          createdEntry.status = currentStatus;
          for (const currentListener of statusListeners) {
            currentListener(currentStatus);
          }
        });
    }

    const subscribedEntry = entry;
    subscribedEntry.listeners.add(listener);
    if (statusListener) {
      subscribedEntry.statusListeners.add(statusListener);
      if (subscribedEntry.status) statusListener(subscribedEntry.status);
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;

      subscribedEntry.listeners.delete(listener);
      if (statusListener) subscribedEntry.statusListeners.delete(statusListener);
      if (subscribedEntry.listeners.size > 0) return;

      if (entries.get(showId) === subscribedEntry) entries.delete(showId);
      void client.removeChannel(subscribedEntry.channel);
    };
  };

  return { subscribe };
}

const showChangeSignalRegistry = createShowChangeSignalRegistry(supabase);

export const subscribeToShowChanges = showChangeSignalRegistry.subscribe;
