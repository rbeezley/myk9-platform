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

export function createAccountTodayEntriesSubscriptionRegistry(
  sources: readonly AccountTodaySubscriptionSource[],
  coalesceMs = 100
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
        if (created.timer) clearTimeout(created.timer);
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
