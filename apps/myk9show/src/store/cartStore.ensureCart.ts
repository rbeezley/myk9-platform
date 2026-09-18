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
 *
 * The opener's RESULT is a discriminated union rather than `CartWithDetails |
 * null`, because "no cart, and no reason" is what hung the class step: every
 * `null` exit `loadActiveCart` has resolves without setting an error, so a
 * caller that rendered from `null` had nothing to say and nothing to retry.
 * Here the only two outcomes are `ready` with a cart and `failed` with a
 * message, so the hang is unrepresentable instead of guarded.
 */
import type { CartWithDetails, EnsureCartResult } from './cartStore.types';

export type { EnsureCartResult };

/** `create unique index … on entry_carts (show_id, exhibitor_id) where status = 'active'`. */
export const ACTIVE_CART_UNIQUE_INDEX = 'entry_carts_active_show_exhibitor_unique_idx';

/**
 * Shown when the opener failed with nothing more specific — a recover that
 * found nothing and a create that could not insert. Deliberately a sentence the
 * class step can render as-is.
 */
export const CART_OPEN_FAILED_MESSAGE = 'We could not open your cart.';

/** Shown when the opener never settled at all, rather than failing. */
export const CART_OPEN_TIMED_OUT_MESSAGE = 'Your cart is taking too long to open.';

/**
 * How long the opener may stay in flight before it is reported as `failed`.
 *
 * The result type makes "resolved with nothing and no reason" unrepresentable;
 * it says nothing about a request that never resolves. `supabaseClient.ts`
 * builds the client with no custom fetch and no AbortSignal, so a stalled
 * PostgREST request (captive portal, TCP black hole, a sleeping radio) leaves
 * this promise pending forever, and the class step then renders the original
 * bug: inert chips, nothing said, nothing to retry (review D2).
 *
 * 20s is well past any observed round trip for this opener — the staging replay
 * settles it in under a second, and the e2e suite's own first-paint waits are
 * 15s — while still being short enough that an exhibitor who has lost
 * connectivity gets an alert and a Try again instead of an indefinite spinner.
 */
export const CART_OPEN_TIMEOUT_MS = 20_000;

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
  /**
   * The message the store recorded for the most recent cart failure, used as the
   * CAUSE handed to `onFailure`. `createCart` swallows its PostgREST error and
   * returns null, so without this the logger only ever sees the generic
   * user-facing sentence and the real code / constraint is lost (review C P3-1).
   */
  lastError: () => string | null;
  /**
   * Called with the message that is about to be returned as `failed`, so the
   * store can log it and leave `isLoading: false`. It does not decide the
   * result — the result is decided here, which is why a caller cannot be handed
   * a failure the store forgot to record.
   */
  onFailure: (message: string, cause?: unknown) => void;
}

const ensureCartInFlight = new Map<string, Promise<EnsureCartResult>>();

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
): Promise<EnsureCartResult> {
  const key = `${showId}:${exhibitorId}`;
  const inFlight = ensureCartInFlight.get(key);
  if (inFlight) return inFlight;

  const fail = (message: string, cause?: unknown): EnsureCartResult => {
    deps.onFailure(message, cause);
    return { kind: 'failed', error: message };
  };

  const work: Promise<EnsureCartResult> = (async (): Promise<EnsureCartResult> => {
    try {
      // Recovers a lapsed cart WITH its items and extends the hold, exactly as
      // /cart does. It resolves null both when this exhibitor genuinely has no
      // cart for the show and when a read on the way there failed — it never
      // says which, which is why the create below is the only thing that can
      // turn a null into a `ready`, and why anything short of that is `failed`.
      const recovered = await deps.loadActiveCart(exhibitorId, { showId });
      if (recovered) return { kind: 'ready', cart: recovered };

      const created = await deps.createCart(showId, exhibitorId);
      if (created) return { kind: 'ready', cart: created };

      // `createCart` returns null on its own catch AND on the conflict branch
      // when the row it went to recover is unreadable. Both are failures with
      // no cart; neither may reach a caller as silence. The message it recorded
      // on the store is the only surviving trace of the PostgREST error, so it
      // travels as the cause even though the caller is shown the generic line.
      return fail(CART_OPEN_FAILED_MESSAGE, deps.lastError() ?? undefined);
    } catch (error) {
      // NEVER rejects: callers hold this promise for a mounted step, and a
      // rejection there is an unhandled rejection that leaves the cart stuck
      // loading. A throw is one more way to have no cart, so it is `failed`.
      const message =
        error instanceof Error && error.message ? error.message : CART_OPEN_FAILED_MESSAGE;
      return fail(message, error);
    }
  })();

  // Bounded, not merely typed: whichever of the two settles first decides the
  // result, so a request that never comes back still produces `failed`.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<EnsureCartResult>(resolve => {
    timer = setTimeout(() => resolve(fail(CART_OPEN_TIMED_OUT_MESSAGE)), CART_OPEN_TIMEOUT_MS);
  });

  const pending: Promise<EnsureCartResult> = Promise.race([work, timedOut]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
    // Cleared on the timeout too, so Try again re-runs the opener rather than
    // joining the stalled one.
    if (ensureCartInFlight.get(key) === pending) ensureCartInFlight.delete(key);
  });

  ensureCartInFlight.set(key, pending);
  return pending;
}

/** Test-only: this module holds mutable state that outlives a single test. */
export function resetEnsureCartInFlight(): void {
  ensureCartInFlight.clear();
}
