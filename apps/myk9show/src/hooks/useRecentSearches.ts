/**
 * Device-local recent search history (context-aware-command-menu, design.md
 * Decision 4: "Recent searches remain device-local, validated, and safe to
 * clear. Their storage key is namespaced by authenticated user; account
 * changes clear in-memory history, and restored items are revalidated
 * against current permissions and show scope before display.").
 *
 * Follows the MYK9-48 `localViewPreferences.ts` pattern: versioned,
 * namespaced storage key (`recent-searches:v{version}:{userId}:{context}`),
 * restore-time schema validation, and an account-change clear helper +
 * hook mirroring `useResetSavedViewsOnAccountChange`.
 *
 * Signed-out users (no authenticated userId) get in-memory-only history —
 * nothing is persisted to storage, so nothing can leak across sign-in on a
 * shared device.
 *
 * Pre-launch: the legacy global `myK9Show_recentSearches` key (unnamespaced,
 * shared across all users) is deleted on first use rather than migrated —
 * project rule: no backwards-compat shims/migration cliffs pre-launch.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/services/LoggingService';
import { useAuthContext } from '@/hooks/useAuthContext';

export interface RecentSearch {
  id: string;
  query: string;
  timestamp: number;
  context: string; // e.g., 'dogs', 'people', 'shows'
  metadata?: {
    resultCount?: number;
    filters?: Record<string, unknown>;
    selectedCommand?: string;
  };
}

interface UseRecentSearchesOptions {
  maxItems?: number;
  context: string;
}

const DEFAULT_MAX_ITEMS = 10;

const RECENT_SEARCHES_SERIALIZATION_VERSION = 1;
const NAMESPACE_PREFIX = 'recent-searches';
const LEGACY_STORAGE_KEY = 'myK9Show_recentSearches';

/** Minimal storage contract — satisfied by `window.localStorage`, injectable for tests. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

interface RecentSearchRecord {
  version: number;
  userId: string;
  context: string;
  searches: RecentSearch[];
}

export function buildRecentSearchesKey(
  userId: string,
  context: string,
  version: number = RECENT_SEARCHES_SERIALIZATION_VERSION
): string {
  return `${NAMESPACE_PREFIX}:v${version}:${userId}:${context}`;
}

function getWindowStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

/** Best-effort storage access probe — returns null (not a throw) when storage is unavailable/blocked. */
function safeGetStorage(storage: KeyValueStorage | undefined | null): KeyValueStorage | null {
  if (!storage) return null;
  try {
    const probeKey = `${NAMESPACE_PREFIX}:__probe__`;
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

/** Delete the legacy unnamespaced global key on every mount (pre-launch, no migration shim). Idempotent — a no-op once already removed. */
function deleteLegacyKeyOnce(storage: KeyValueStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Best effort — storage unavailable.
  }
}

function isValidRecentSearch(value: unknown, expectedContext: string): value is RecentSearch {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RecentSearch>;
  if (typeof candidate.id !== 'string' || !candidate.id) return false;
  if (typeof candidate.query !== 'string' || !candidate.query) return false;
  if (typeof candidate.timestamp !== 'number' || !Number.isFinite(candidate.timestamp)) return false;
  if (typeof candidate.context !== 'string' || candidate.context !== expectedContext) return false;
  if (candidate.metadata !== undefined) {
    if (typeof candidate.metadata !== 'object' || candidate.metadata === null) return false;
  }
  return true;
}

/**
 * Restore a validated, namespaced recent-search list for a user/context.
 * Drops the whole entry on any structural mismatch (version, userId,
 * context) and drops individual bad items rather than failing the list.
 */
function restoreRecentSearches(
  storage: KeyValueStorage | undefined | null,
  userId: string,
  context: string,
  maxItems: number
): RecentSearch[] {
  const safeStorage = safeGetStorage(storage);
  if (!safeStorage || !userId) return [];

  const key = buildRecentSearchesKey(userId, context);
  const raw = safeStorage.getItem(key);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logger.warn('Failed to parse stored recent searches', 'hooks', {}, error as Error);
    safeStorage.removeItem(key);
    return [];
  }

  if (!parsed || typeof parsed !== 'object') {
    safeStorage.removeItem(key);
    return [];
  }
  const record = parsed as Partial<RecentSearchRecord>;

  if (
    record.version !== RECENT_SEARCHES_SERIALIZATION_VERSION ||
    record.userId !== userId ||
    record.context !== context ||
    !Array.isArray(record.searches)
  ) {
    safeStorage.removeItem(key);
    return [];
  }

  const validated = record.searches
    .filter(search => isValidRecentSearch(search, context))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxItems);

  return validated;
}

function persistRecentSearches(
  storage: KeyValueStorage | undefined | null,
  userId: string,
  context: string,
  searches: RecentSearch[]
): void {
  const safeStorage = safeGetStorage(storage);
  if (!safeStorage || !userId) return;

  const record: RecentSearchRecord = {
    version: RECENT_SEARCHES_SERIALIZATION_VERSION,
    userId,
    context,
    searches,
  };

  try {
    safeStorage.setItem(buildRecentSearchesKey(userId, context), JSON.stringify(record));
  } catch (error) {
    logger.warn('Failed to save recent searches', 'hooks', {}, error as Error);
  }
}

/**
 * Remove every namespaced recent-search key belonging to `userId` (all
 * contexts, current version). Call when the authenticated user changes on a
 * shared device so a prior user's recent searches are never listed or
 * restored under the new session.
 */
export function clearAllRecentSearchesForUser(
  storage: KeyValueStorage | undefined | null,
  userId: string
): void {
  const safeStorage = safeGetStorage(storage);
  if (!safeStorage || !userId) return;

  const suffix = `:${userId}:`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < safeStorage.length; i++) {
    const key = safeStorage.key(i);
    if (key && key.startsWith(`${NAMESPACE_PREFIX}:`) && key.includes(suffix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => safeStorage.removeItem(key));
}

export function useRecentSearches(options: UseRecentSearchesOptions) {
  const { context, maxItems = DEFAULT_MAX_ITEMS } = options;
  const { user } = useAuthContext();
  const userId = user?.id ?? null;

  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const userIdRef = useRef<string | null>(userId);

  // Load (or clear, for signed-out) recent searches for this user/context on mount and on user change.
  useEffect(() => {
    userIdRef.current = userId;
    const storage = getWindowStorage();
    deleteLegacyKeyOnce(storage);

    queueMicrotask(() => {
      // Guard against a user change racing this microtask.
      if (userIdRef.current !== userId) return;

      if (!userId) {
        setRecentSearches([]);
        return;
      }

      try {
        const restored = restoreRecentSearches(storage, userId, context, maxItems);
        setRecentSearches(restored);
      } catch (error) {
        logger.warn('Failed to load recent searches:', 'hooks', {}, error as Error);
        setRecentSearches([]);
      }
    });
  }, [userId, context, maxItems]);

  const saveToStorage = useCallback(
    (searches: RecentSearch[]) => {
      if (!userId) return; // Signed-out: in-memory only, never persisted.
      persistRecentSearches(getWindowStorage(), userId, context, searches);
    },
    [userId, context]
  );

  const addSearch = useCallback(
    (query: string, metadata?: RecentSearch['metadata']) => {
      if (!query.trim()) return;

      const newSearch: RecentSearch = {
        id: `${context}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        query: query.trim(),
        timestamp: Date.now(),
        context,
        ...(metadata !== undefined && { metadata }),
      };

      setRecentSearches(prev => {
        const filtered = prev.filter(search => search.query.toLowerCase() !== query.toLowerCase());
        const updated = [newSearch, ...filtered].slice(0, maxItems);
        saveToStorage(updated);
        return updated;
      });
    },
    [context, maxItems, saveToStorage]
  );

  const removeSearch = useCallback(
    (searchId: string) => {
      setRecentSearches(prev => {
        const updated = prev.filter(search => search.id !== searchId);
        saveToStorage(updated);
        return updated;
      });
    },
    [saveToStorage]
  );

  const clearSearches = useCallback(() => {
    setRecentSearches([]);
    saveToStorage([]);
  }, [saveToStorage]);

  const getSuggestions = useCallback(
    (currentQuery: string, limit: number = 5): RecentSearch[] => {
      if (!currentQuery.trim()) {
        return recentSearches.slice(0, limit);
      }

      const query = currentQuery.toLowerCase();
      return recentSearches.filter(search => search.query.toLowerCase().includes(query)).slice(0, limit);
    },
    [recentSearches]
  );

  const getFrequentSearches = useCallback(
    (limit: number = 5): { query: string; count: number }[] => {
      const queryCount = new Map<string, number>();

      recentSearches.forEach(search => {
        const query = search.query.toLowerCase();
        queryCount.set(query, (queryCount.get(query) || 0) + 1);
      });

      return Array.from(queryCount.entries())
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    },
    [recentSearches]
  );

  return {
    recentSearches,
    addSearch,
    removeSearch,
    clearSearches,
    getSuggestions,
    getFrequentSearches,
  };
}
