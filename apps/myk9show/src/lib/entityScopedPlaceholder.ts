/**
 * The app-wide placeholder rule: keep the previous data while a query re-keys,
 * but ONLY within the same entities (MYK9-709).
 *
 * `placeholderData: previousData => previousData` used to apply to every key.
 * TanStack hands a mounted observer the last data it held, whatever key that
 * data came from, so a consumer that survives a show change rendered show A's
 * rows under show B until B's read landed: A's scheduled-email toggles written
 * to B, A's volunteers deletable from B's page, and under reduced motion (where
 * `PageTransition` stops remounting pages) about 25 more hooks. Opting out one
 * hook at a time (MYK9-648) left every new hook wrong by default.
 *
 * The rule now lives where the default does. Previous data is kept only when
 * the previous key and the new key name the SAME entity ids — every UUID in
 * the key, at any depth. A search term, a page number, a sort or a filter
 * flag still keeps the list on screen while it re-reads; a different show,
 * class, trial, dog or person does not, and the query reports `isLoading`
 * like a first mount instead of reporting another entity's data as success.
 *
 * Why UUIDs and not a list of "show" keys: key shapes vary across ~70 files
 * (`['volunteers', id]`, `[['shows', id], …]`, `{ showId }` inside a filter
 * object), and a list would be the per-hook opt-out again. Every entity id in
 * this schema is a UUID; nothing else in a key is.
 *
 * Why a client subclass: TanStack calls a placeholder function with the
 * previous data and the previous QUERY, never the current key. The client's
 * `defaultQueryOptions` is the one place that sees both the resolved default
 * and the key it is being resolved for; every observer (`useQuery`,
 * `useInfiniteQuery`, `useQueries`) resolves its options there. A query that
 * sets its own `placeholderData` is left exactly as written.
 */
import {
  QueryClient,
  type DefaultError,
  type DefaultedQueryObserverOptions,
  type QueryKey,
  type QueryObserverOptions,
} from '@tanstack/react-query';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function collectEntityIds(value: unknown, ids: string[]): void {
  if (typeof value === 'string') {
    if (UUID.test(value)) ids.push(value.toLowerCase());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEntityIds(item, ids);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectEntityIds(item, ids);
  }
}

/** Every UUID in a query key, at any depth, sorted: the entities it names. */
export function entityIdsInQueryKey(queryKey: QueryKey): string[] {
  const ids: string[] = [];
  collectEntityIds(queryKey, ids);
  return ids.sort();
}

/** True when both keys name exactly the same entity ids. */
export function isSameEntityScope(previousKey: QueryKey, nextKey: QueryKey): boolean {
  const previous = entityIdsInQueryKey(previousKey);
  const next = entityIdsInQueryKey(nextKey);
  return previous.length === next.length && previous.every((id, index) => id === next[index]);
}

/**
 * The marker the app's default options carry. On its own it keeps previous
 * data unconditionally, which is why only `EntityScopedQueryClient` may use it:
 * that client swaps it for the key-aware rule before any observer sees it.
 */
export function keepPreviousDataInEntityScope<T>(previousData: T): T {
  return previousData;
}

export class EntityScopedQueryClient extends QueryClient {
  override defaultQueryOptions<
    TQueryFnData = unknown,
    TError = DefaultError,
    TData = TQueryFnData,
    TQueryData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
    TPageParam = never,
  >(
    options:
      | QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey, TPageParam>
      | DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>
  ): DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey> {
    const defaulted = super.defaultQueryOptions(options);
    if (defaulted.placeholderData !== keepPreviousDataInEntityScope) return defaulted;

    const queryKey = defaulted.queryKey;
    return {
      ...defaulted,
      placeholderData: (previousData, previousQuery) =>
        previousQuery && isSameEntityScope(previousQuery.queryKey, queryKey)
          ? previousData
          : undefined,
    };
  }
}
