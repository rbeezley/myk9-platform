/**
 * The registration wizard's cart opener (MYK9-581).
 *
 * `entry_carts_active_show_exhibitor_unique_idx` is `(show_id, exhibitor_id)
 * WHERE status = 'active'` — it knows nothing about `expires_at`. A read that
 * filters on `expires_at` therefore reports "no cart" for a row the index still
 * rejects an insert against, which is how a normal wizard open produced a 409.
 *
 * The answer is not to retire the lapsed row: `/cart` (`loadActiveCart`) and
 * the header badge (`useActiveCartItemCount`) both read `status IN
 * ('active','expired')` with NO expiry filter precisely so a cart drafted in an
 * earlier session is RECOVERED with its items. Retiring it and inserting a
 * fresh empty cart would make that draft unreachable and read the badge as 0.
 * So the opener recovers through the same `loadActiveCart` path those surfaces
 * use, and only creates when there is genuinely nothing to recover.
 */
import type { CartWithDetails } from './cartStore.types';

/** `create unique index … on entry_carts (show_id, exhibitor_id) where status = 'active'`. */
export const ACTIVE_CART_UNIQUE_INDEX = 'entry_carts_active_show_exhibitor_unique_idx';

/**
 * `createCart`'s conflict handling is written for ONE conflict — a second
 * active cart for the same show and exhibitor. Matching on `23505` alone would
 * absorb a unique violation on any other index `entry_carts` ever gains and
 * report it as a recovered cart, so match the index by name. PostgREST returns
 * `details: null` for this one, so `message` is the only field that carries it.
 */
export const isActiveCartUniqueViolation = (
  error: { code?: string; message?: string; details?: string | null } | null | undefined
): boolean =>
  error?.code === '23505' &&
  `${error.message ?? ''} ${error.details ?? ''}`.includes(ACTIVE_CART_UNIQUE_INDEX);

export interface EnsureCartDeps {
  loadActiveCart: (
    exhibitorId: string,
    options?: { showId?: string }
  ) => Promise<CartWithDetails | null>;
  createCart: (showId: string, exhibitorId: string) => Promise<CartWithDetails | null>;
}

const ensureCartInFlight = new Map<string, Promise<CartWithDetails | null>>();

/**
 * Load-or-create as ONE coalesced unit. Coalescing `createCart` alone was not
 * enough: the step's effect runs `load` then `create`, so a second effect whose
 * load resolved after the first had finished creating found an empty in-flight
 * map and inserted against a fresh, non-lapsed active cart — the 409 again.
 * The whole opener has to be the unit.
 *
 * This map is per tab. A second TAB racing the same insert is what the
 * index-conflict branch in `createCart` is for.
 */
export function ensureCartOnce(
  showId: string,
  exhibitorId: string,
  deps: EnsureCartDeps
): Promise<CartWithDetails | null> {
  const key = `${showId}:${exhibitorId}`;
  const inFlight = ensureCartInFlight.get(key);
  if (inFlight) return inFlight;

  const pending: Promise<CartWithDetails | null> = (async () => {
    // Recovers a lapsed cart WITH its items and extends the hold, exactly as
    // /cart does; returns null only when this exhibitor has no cart for the
    // show at all.
    const recovered = await deps.loadActiveCart(exhibitorId, { showId });
    if (recovered) return recovered;
    return deps.createCart(showId, exhibitorId);
  })().finally(() => {
    if (ensureCartInFlight.get(key) === pending) ensureCartInFlight.delete(key);
  });

  ensureCartInFlight.set(key, pending);
  return pending;
}

/** Test-only: this module holds mutable state that outlives a single test. */
export function resetEnsureCartInFlight(): void {
  ensureCartInFlight.clear();
}
