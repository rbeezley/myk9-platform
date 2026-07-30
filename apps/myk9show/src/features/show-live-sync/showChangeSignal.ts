import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/services/database/supabaseClient';

export const SHOWDAY_CHANGE_EVENT = 'showday_change';

export type ShowChangeTable = 'entries' | 'classes' | 'paperwork_prints';

export interface ShowChangeSignal {
  table: ShowChangeTable;
  /** Legacy-compatible row identifier used to reset a moved or deleted local class snapshot. */
  id?: string;
  /** Old/new class scopes affected by the advisory change. Missing means legacy/unscoped. */
  classIds?: readonly string[];
}

export type ShowChangeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';
export type ShowChangeListener = (signal: ShowChangeSignal) => void;
export type ShowChangeStatusListener = (status: ShowChangeStatus) => void;

type ShowChangeClient = Pick<SupabaseClient, 'channel' | 'removeChannel' | 'realtime'>;

interface RegistryEntry {
  channel: RealtimeChannel | null;
  listeners: Set<ShowChangeListener>;
  statusListeners: Set<ShowChangeStatusListener>;
  status?: ShowChangeStatus;
}

export function showChangesTopic(showId: string): string {
  return `show:${showId}:changes`;
}

interface DatabaseShowChangeSignal {
  table: ShowChangeTable;
  class_ids?: string[];
}

function parseShowChangeSignal(value: unknown): ShowChangeSignal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.every(key => key === 'table' || key === 'id' || key === 'class_ids')) return null;
  if (
    record.table !== 'entries' &&
    record.table !== 'classes' &&
    record.table !== 'paperwork_prints'
  ) {
    return null;
  }
  if (record.id !== undefined && typeof record.id !== 'string') return null;
  if (
    record.class_ids !== undefined &&
    (!Array.isArray(record.class_ids) ||
      !record.class_ids.every(classId => typeof classId === 'string'))
  ) {
    return null;
  }

  const databaseSignal = record as unknown as DatabaseShowChangeSignal;
  return {
    table: databaseSignal.table,
    ...(typeof record.id === 'string' && { id: record.id }),
    ...(databaseSignal.class_ids &&
      databaseSignal.class_ids.length > 0 && { classIds: databaseSignal.class_ids }),
  };
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
      const createdEntry: RegistryEntry = { channel: null, listeners, statusListeners };
      entry = createdEntry;
      entries.set(showId, createdEntry);

      // Supabase Realtime Authorization is separate from PostgREST auth. A
      // private Broadcast channel must not join until setAuth has supplied the
      // current session JWT; otherwise the socket can connect while the channel
      // silently fails authorization and no show-day nudges arrive.
      void client.realtime
        .setAuth()
        .then(() => {
          // Every consumer may have unmounted while auth was resolving.
          if (entries.get(showId) !== createdEntry || listeners.size === 0) return;

          const channel = client.channel(showChangesTopic(showId), { config: { private: true } });
          createdEntry.channel = channel;
          channel
            .on('broadcast', { event: SHOWDAY_CHANGE_EVENT }, message => {
              const signal = parseShowChangeSignal(message.payload);
              if (!signal) return;
              for (const currentListener of listeners) currentListener(signal);
            })
            .subscribe(status => {
              const currentStatus = status as ShowChangeStatus;
              createdEntry.status = currentStatus;
              for (const currentListener of statusListeners) {
                currentListener(currentStatus);
              }
            });
        })
        .catch(() => {
          if (entries.get(showId) !== createdEntry) return;
          createdEntry.status = 'CHANNEL_ERROR';
          for (const currentListener of statusListeners) currentListener('CHANNEL_ERROR');
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
      if (subscribedEntry.channel) void client.removeChannel(subscribedEntry.channel);
    };
  };

  return { subscribe };
}

const showChangeSignalRegistry = createShowChangeSignalRegistry(supabase);

export const subscribeToShowChanges = showChangeSignalRegistry.subscribe;
