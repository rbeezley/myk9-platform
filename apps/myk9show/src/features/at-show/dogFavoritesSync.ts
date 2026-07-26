/**
 * dogFavoritesSync — the signed-in half of at-show dog favorites (MYK9-79).
 *
 * `ringsideDogFavorites` remains the device-local store: it is what the at-show
 * entry list reads and writes, it works offline, and it is the ONLY store an
 * anonymous passcode session has. This module mirrors that store into
 * `public.dog_favorites` for signed-in users so the notification monitor can
 * watch favorited armbands for "your turn" proximity push, which localStorage
 * can never deliver to a backgrounded PWA.
 *
 * Reconciliation rule (documented once, here):
 *
 *   - FIRST sync for a (user, show) pair: the local set SEEDS the server. The
 *     union of local + server is written to both sides, so favorites starred
 *     before signing in are never lost.
 *   - EVERY sync after that: the SERVER is the source of truth. It is written
 *     back over the local store, so unstarring on one device propagates.
 *   - A toggle always writes localStorage FIRST and synchronously. The server
 *     write is best-effort; when it fails (offline, RLS, anything) the local
 *     favorite stands and the at-show UI is unaffected. The seed marker is only
 *     set after a successful sync, so an offline first run retries — and still
 *     seeds — on the next load.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  migrateAnonymousDogFavorites,
  readDogFavoriteArmbands,
  replaceDogFavoriteArmbands,
  useAtShowDogFavorites,
} from './ringsideDogFavorites';

const SEEDED_KEY_PREFIX = 'dog_favorites_seeded';

export function getAccountUserId(
  user: { id: string; is_anonymous?: boolean } | null | undefined
): string {
  return user?.id && !user.is_anonymous ? user.id : '';
}

export interface DogFavoriteRow {
  show_id: string;
  armband: number;
}

/**
 * `dog_favorites` is newer than the checked-in generated `Database` types, so
 * the client is narrowed structurally here — the same escape hatch
 * `WaitlistFormLanding` uses for `platform_waitlist`. Keeping it in one place
 * means exactly one cast in the app.
 */
interface DogFavoritesTable {
  select: (columns: string) => {
    eq: (
      column: string,
      value: string
    ) => {
      in: (
        column: string,
        values: string[]
      ) => Promise<{ data: DogFavoriteRow[] | null; error: unknown }>;
    };
  };
  upsert: (
    rows: Record<string, unknown>[],
    options: { onConflict: string; ignoreDuplicates: boolean }
  ) => Promise<{ error: unknown }>;
  delete: () => {
    eq: (
      column: string,
      value: string
    ) => {
      eq: (
        column: string,
        value: string
      ) => {
        eq: (column: string, value: number) => Promise<{ error: unknown }>;
      };
    };
  };
}

function dogFavoritesTable(): DogFavoritesTable {
  return (supabase as unknown as { from: (table: string) => DogFavoritesTable }).from(
    'dog_favorites'
  );
}

export function buildFavoritesSeededKey(userId: string, showId: string): string {
  return `${SEEDED_KEY_PREFIX}_${userId}_${showId}`;
}

function hasSeeded(userId: string, showId: string): boolean {
  try {
    return localStorage.getItem(buildFavoritesSeededKey(userId, showId)) === '1';
  } catch {
    return false;
  }
}

function markSeeded(userId: string, showId: string): void {
  try {
    localStorage.setItem(buildFavoritesSeededKey(userId, showId), '1');
  } catch {
    // A storage failure only costs us a redundant seed on the next load.
  }
}

/** Group server rows into the per-show armband sets the monitor watches. */
export function toFavoriteArmbandsByShow(
  rows: readonly DogFavoriteRow[]
): Map<string, Set<number>> {
  const byShow = new Map<string, Set<number>>();
  for (const row of rows) {
    if (!row.show_id || !Number.isInteger(row.armband)) continue;
    const armbands = byShow.get(row.show_id) ?? new Set<number>();
    armbands.add(row.armband);
    byShow.set(row.show_id, armbands);
  }
  return byShow;
}

/**
 * The set that should end up on BOTH sides after a sync, plus what has to be
 * written to close the gap. Pure — this is the reconciliation rule under test.
 */
export interface FavoritesReconciliation {
  /** Armbands the device should hold once the sync lands. */
  resolved: number[];
  /** Armbands missing server-side that this sync must insert. */
  toInsert: number[];
}

export function reconcileFavorites(
  local: readonly number[],
  server: readonly number[],
  alreadySeeded: boolean
): FavoritesReconciliation {
  const serverSet = new Set(server);

  if (alreadySeeded) {
    // Server wins: an unstar on another device must not be resurrected.
    return { resolved: [...serverSet].sort((a, b) => a - b), toInsert: [] };
  }

  const union = new Set([...server, ...local]);
  return {
    resolved: [...union].sort((a, b) => a - b),
    toInsert: local.filter(armband => !serverSet.has(armband)),
  };
}

async function fetchFavoriteRows(userId: string, showIds: string[]): Promise<DogFavoriteRow[]> {
  if (showIds.length === 0) return [];
  const { data, error } = await dogFavoritesTable()
    .select('show_id, armband')
    .eq('user_id', userId)
    .in('show_id', showIds);
  if (error) throw error;
  return data ?? [];
}

/** Best-effort server write for a newly starred armband. Never throws. */
export async function persistFavorite(
  userId: string,
  showId: string,
  armband: number
): Promise<boolean> {
  try {
    const { error } = await dogFavoritesTable().upsert(
      [{ user_id: userId, show_id: showId, armband }],
      { onConflict: 'user_id,show_id,armband', ignoreDuplicates: true }
    );
    return !error;
  } catch {
    return false;
  }
}

/** Best-effort server delete for an unstarred armband. Never throws. */
export async function removeFavorite(
  userId: string,
  showId: string,
  armband: number
): Promise<boolean> {
  try {
    const { error } = await dogFavoritesTable()
      .delete()
      .eq('user_id', userId)
      .eq('show_id', showId)
      .eq('armband', armband);
    return !error;
  } catch {
    return false;
  }
}

const favoriteWriteQueues = new Map<string, Promise<void>>();

/** Serialize writes for one account/show so a toggle cannot lose to a sync insert. */
function enqueueFavoriteWrite<T>(
  userId: string,
  showId: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = `${userId}\u0000${showId}`;
  const previous = favoriteWriteQueues.get(key) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  const settled = next.then(
    () => undefined,
    () => undefined
  );
  favoriteWriteQueues.set(key, settled);
  void settled.then(() => {
    if (favoriteWriteQueues.get(key) === settled) favoriteWriteQueues.delete(key);
  });
  return next;
}

function sameFavoriteArmbands(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(armband => rightSet.has(armband));
}

export const dogFavoritesQueryKey = (showIds: readonly string[]) =>
  ['dog-favorites', [...showIds].sort().join(',')] as const;

/**
 * Favorited armbands per show for the signed-in user — the monitor's half of
 * the watch set. Returns an empty map when signed out, so an anonymous session
 * never widens the watch set and never triggers a push attempt.
 */
export function useFavoriteArmbandsByShow(showIds: string[]): Map<string, Set<number>> {
  const { user } = useAuthContext();
  const userId = getAccountUserId(user);
  const showIdsKey = useMemo(() => [...showIds].sort().join(','), [showIds]);
  const stableShowIds = useMemo(() => (showIdsKey ? showIdsKey.split(',') : []), [showIdsKey]);

  const { data } = useQuery({
    queryKey: [...dogFavoritesQueryKey(stableShowIds), userId],
    queryFn: () => fetchFavoriteRows(userId, stableShowIds),
    enabled: Boolean(userId) && stableShowIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return useMemo(() => toFavoriteArmbandsByShow(data ?? []), [data]);
}

/**
 * Runs the localStorage <-> server reconciliation for one show. Mounted by the
 * at-show entry list surfaces; a no-op when signed out or offline-failing.
 */
export function useDogFavoritesServerSync(showId: string | undefined): void {
  const { user } = useAuthContext();
  const userId = getAccountUserId(user);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !showId) return undefined;
    let cancelled = false;

    migrateAnonymousDogFavorites(showId, userId);

    void (async () => {
      let serverRows: DogFavoriteRow[];
      try {
        serverRows = await fetchFavoriteRows(userId, [showId]);
      } catch {
        // Offline or transient: the local store is untouched and authoritative
        // for this session; the seed marker stays unset so we retry next load.
        return;
      }
      if (cancelled) return;

      const local = readDogFavoriteArmbands(showId, userId);
      const server = serverRows.map(row => row.armband);
      const { resolved, toInsert } = reconcileFavorites(local, server, hasSeeded(userId, showId));

      const inserts = await Promise.all(
        toInsert.map(armband =>
          enqueueFavoriteWrite(userId, showId, () => persistFavorite(userId, showId, armband))
        )
      );
      if (cancelled) return;

      if (inserts.every(Boolean)) markSeeded(userId, showId);
      const latestLocal = readDogFavoriteArmbands(showId, userId);
      // A toggle changed local state while the server write was in flight;
      // preserve that immediate action and let the next sync reconcile it.
      if (sameFavoriteArmbands(local, latestLocal)) {
        replaceDogFavoriteArmbands(showId, resolved, userId);
      }
      void queryClient.invalidateQueries({ queryKey: ['dog-favorites'] });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, showId, queryClient]);
}

/**
 * Drop-in replacement for `useAtShowDogFavorites` on the at-show entry lists:
 * same device-local behaviour for everyone, plus a signed-in server mirror.
 *
 * The local toggle runs first and synchronously, so the star flips instantly and
 * survives a failed or offline server write. Signed-out users take no server
 * path at all.
 */
export function useAtShowDogFavoritesSynced(showId: string | undefined) {
  const { user } = useAuthContext();
  const userId = getAccountUserId(user);
  const { favoriteArmbands, toggleFavoriteArmband } = useAtShowDogFavorites(showId, userId);
  useDogFavoritesServerSync(showId);

  const toggle = useCallback(
    (armband: number) => {
      const wasFavorited = favoriteArmbands.has(armband);
      toggleFavoriteArmband(armband);
      if (!userId || !showId) return;
      void enqueueFavoriteWrite(
        userId,
        showId,
        wasFavorited
          ? () => removeFavorite(userId, showId, armband)
          : () => persistFavorite(userId, showId, armband)
      );
    },
    [favoriteArmbands, toggleFavoriteArmband, userId, showId]
  );

  return { favoriteArmbands, toggleFavoriteArmband: toggle };
}
