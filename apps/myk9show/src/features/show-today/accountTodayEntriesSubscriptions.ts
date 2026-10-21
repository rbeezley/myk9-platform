import type { QueryClient, QueryKey } from '@tanstack/react-query';

interface SubscriptionOptions {
  emitCurrent?: boolean;
}

export interface AccountTodaySubscriptionSource {
  subscribe(callback: (data: unknown[]) => void, options?: SubscriptionOptions): () => void;
}

interface SharedSubscription {
  consumers: number;
  disposed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  unsubscribes: Array<() => void>;
}

// MYK9-1307: at most one invalidation per 30 s window. The first write after an idle period
// schedules ONE invalidation; later writes inside the window do not reschedule it, so a change
// shows at most 30 s after the first write and continuous writes cannot starve the refetch.
// History: this was a 1.5 s trailing debounce (MYK9-1066, a sync's replica writes land more than
// 100 ms apart), which still fired every quiet 1.5 s under steady writes (308 RPCs in the
// sessions=50 baseline).
export const ACCOUNT_TODAY_COALESCE_MS = 30_000;

export function createAccountTodayEntriesSubscriptionRegistry(
  sources: readonly AccountTodaySubscriptionSource[],
  coalesceMs = ACCOUNT_TODAY_COALESCE_MS
) {
  const clients = new WeakMap<QueryClient, Map<string, SharedSubscription>>();

  const retain = (queryClient: QueryClient, queryKey: QueryKey): (() => void) => {
    let entries = clients.get(queryClient);
    if (!entries) {
      entries = new Map();
      clients.set(queryClient, entries);
    }

    const registryKey = JSON.stringify(queryKey);
    let shared = entries.get(registryKey);
    if (!shared) {
      const created: SharedSubscription = {
        consumers: 0,
        disposed: false,
        timer: null,
        unsubscribes: [],
      };
      const invalidate = () => {
        if (created.disposed) return;
        if (created.timer) return;
        created.timer = setTimeout(() => {
          created.timer = null;
          if (created.disposed) return;
          void queryClient.invalidateQueries({ queryKey });
        }, coalesceMs);
      };
      created.unsubscribes = sources.map(source =>
        source.subscribe(invalidate, { emitCurrent: false })
      );
      shared = created;
      entries.set(registryKey, created);
    }
    shared.consumers += 1;

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      shared.consumers -= 1;
      if (shared.consumers > 0) return;

      shared.disposed = true;
      if (shared.timer) clearTimeout(shared.timer);
      shared.unsubscribes.forEach(unsubscribe => unsubscribe());
      entries?.delete(registryKey);
      if (entries?.size === 0) clients.delete(queryClient);
    };
  };

  return { retain };
}
