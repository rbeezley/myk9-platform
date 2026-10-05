// Hold class spots while the exhibitor pays (MYK9-1012).
//
// stripe-checkout holds a spot for every new cart line BEFORE it opens a Stripe
// Checkout page, and the hold lasts exactly as long as the page: the page is
// created with `expires_at` = the hold's expiry, and once the cart links the
// page the hold is set to the expiry Stripe returned. The rule itself is in
// the database (`hold_cart_spots`, migration 20261004235300): it decides each
// line under evaluate_entry_capacity's locks, so two Pay clicks for the last
// spot cannot both win, and it holds every line or none.
//
// When a line has no room nothing is charged: the caller answers 409 with
// `describeRefusedLines`, and the cart reloads to show the line as full (with
// its wait-list option when the class has one).
//
// Pure apart from the injected rpc client, so the orchestration is
// unit-testable without Deno or Stripe.

/**
 * How long a hold (and its Stripe page) lasts, in seconds. Stripe's minimum
 * `expires_at` is 30 minutes measured at ITS clock on arrival, so an exact
 * +30:00 computed before the network hop is rejected (round-15 P1); one more
 * minute buys the buffer. The exhibitor is told "30 minutes".
 */
export const CART_SPOT_HOLD_SECONDS = 31 * 60;

export interface HoldRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

export interface RefusedCartLine {
  cart_item_id: string;
  class_id: string;
  dog_id: string;
  allow_waitlist: boolean;
  /** NULL: the class or a judge's day is full. Otherwise the entry rule's reason. */
  denial_reason: string | null;
}

interface HoldRow extends RefusedCartLine {
  outcome: 'held' | 'refused';
}

export type CartHoldResult =
  | { kind: 'held'; heldCount: number }
  | { kind: 'refused'; lines: RefusedCartLine[] }
  | { kind: 'error'; message: string };

/** Epoch seconds for a hold starting now. */
export function cartSpotHoldUntilEpoch(nowMs: number): number {
  return Math.floor(nowMs / 1000) + CART_SPOT_HOLD_SECONDS;
}

export function epochToIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

/**
 * One Pay click. Every hold it takes carries `attemptId`, and attach and
 * release touch only that attempt's holds (Codex P1 on #2755): two Pay
 * requests for one cart can both hold before either records its page, and the
 * loser's cleanup must not take the winner's spots with it.
 */
export interface PayAttempt {
  cartId: string;
  attemptId: string;
}

export interface HoldTarget {
  /** The page these holds are for when it already exists (a reused page). */
  sessionId?: string | null;
  /** A page this Pay has retired (expired, or is re-holding): its holds go back. */
  retiredSessionId?: string | null;
}

/** Hold every new line of the cart for this attempt, or hold nothing. */
export async function holdCartSpots(
  db: HoldRpcClient,
  attempt: PayAttempt,
  expiresAtEpoch: number,
  target: HoldTarget = {}
): Promise<CartHoldResult> {
  const { data, error } = await db.rpc('hold_cart_spots', {
    p_cart_id: attempt.cartId,
    p_attempt_id: attempt.attemptId,
    p_expires_at: epochToIso(expiresAtEpoch),
    p_checkout_session_id: target.sessionId ?? null,
    p_release_session_id: target.retiredSessionId ?? null,
  });
  if (error) return { kind: 'error', message: error.message ?? 'hold_cart_spots failed' };
  const rows = (Array.isArray(data) ? data : []) as HoldRow[];
  const refused = rows.filter(row => row.outcome === 'refused');
  if (refused.length > 0) {
    return {
      kind: 'refused',
      lines: refused.map(({ cart_item_id, class_id, dog_id, allow_waitlist, denial_reason }) => ({
        cart_item_id,
        class_id,
        dog_id,
        allow_waitlist: allow_waitlist === true,
        denial_reason: denial_reason ?? null,
      })),
    };
  }
  return { kind: 'held', heldCount: rows.length };
}

/**
 * Tie this attempt's holds to the page the cart now links, ending when the
 * page does. `tied` is how many it tied; the page may be handed out only when
 * that is every line the attempt held (`pageIsFullyHeld`).
 */
export async function attachCartSpotHolds(
  db: HoldRpcClient,
  attempt: PayAttempt,
  sessionId: string,
  sessionExpiresAtEpoch: number
): Promise<{ tied: number | null; error: string | null }> {
  const { data, error } = await db.rpc('attach_cart_spot_holds', {
    p_cart_id: attempt.cartId,
    p_attempt_id: attempt.attemptId,
    p_checkout_session_id: sessionId,
    p_expires_at: epochToIso(sessionExpiresAtEpoch),
  });
  if (error) return { tied: null, error: error.message ?? 'attach_cart_spot_holds failed' };
  return { tied: typeof data === 'number' ? data : null, error: null };
}

/** A page is safe to hand out only when every line this attempt held is tied to it. */
export function pageIsFullyHeld(
  attach: { tied: number | null; error: string | null },
  heldCount: number
): boolean {
  return attach.error === null && attach.tied === heldCount;
}

/** Give back THIS attempt's spots when its page could not be opened, recorded or tied. */
export async function releaseCartSpotHolds(
  db: HoldRpcClient,
  attempt: PayAttempt
): Promise<{ error: string | null }> {
  const { error } = await db.rpc('release_cart_spot_holds', {
    p_cart_id: attempt.cartId,
    p_attempt_id: attempt.attemptId,
    p_reason: 'checkout_failed',
  });
  return { error: error ? (error.message ?? 'release_cart_spot_holds failed') : null };
}

/** A line refused at Pay: nothing is charged and the caller answers 409. */
export class CartHoldRefusedError extends Error {
  readonly lines: RefusedCartLine[];
  constructor(lines: RefusedCartLine[]) {
    super('cart spots refused at Pay');
    this.name = 'CartHoldRefusedError';
    this.lines = lines;
  }
}

/** The hold could not be taken at all (the database did not answer): retryable. */
export class CartHoldUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartHoldUnavailableError';
  }
}

export const CART_HOLD_UNAVAILABLE_MESSAGE =
  'We could not hold your spots just now. Nothing was charged. Please try again in a moment.';

/**
 * Hold first, then open the page with the hold's expiry. `retiredSessionId`
 * is the cart's previous page, which resolveCheckoutSession has already
 * retired by the time it asks for a replacement. A page that fails to open
 * gives this attempt's spots straight back.
 */
export async function createSessionUnderHold<T>(
  db: HoldRpcClient,
  attempt: PayAttempt,
  holdUntilEpoch: number,
  retiredSessionId: string | null,
  createSession: (expiresAtEpoch: number) => Promise<T>
): Promise<{ session: T; heldCount: number }> {
  const hold = await holdCartSpots(db, attempt, holdUntilEpoch, { retiredSessionId });
  if (hold.kind === 'refused') throw new CartHoldRefusedError(hold.lines);
  if (hold.kind === 'error') throw new CartHoldUnavailableError(hold.message);
  try {
    return { session: await createSession(holdUntilEpoch), heldCount: hold.heldCount };
  } catch (error) {
    await releaseCartSpotHolds(db, attempt);
    throw error;
  }
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export interface CartLineNames {
  id: string;
  dog?: { call_name?: string | null } | null;
  class?: { name?: string | null } | null;
}

/**
 * What the exhibitor reads when Pay finds a line with no room. It names the
 * dog and the class, says nothing was charged, and points at the two ways on:
 * the class's wait list (only when it has one) or removing the line.
 */
export function describeRefusedLines(
  lines: readonly RefusedCartLine[],
  items: readonly CartLineNames[]
): string {
  const named = lines.map(line => {
    const item = items.find(candidate => candidate.id === line.cart_item_id);
    return {
      dog: item?.dog?.call_name?.trim() || 'your dog',
      cls: item?.class?.name?.trim() || 'the class',
      line,
    };
  });

  if (named.length === 1) {
    const { dog, cls, line } = named[0]!;
    if (line.denial_reason) {
      return `${capitalize(dog)} can't be entered in ${cls} online, so nothing was charged. Remove ${dog} from ${cls} to continue.`;
    }
    return line.allow_waitlist
      ? `${capitalize(cls)} just filled, so nothing was charged. ${capitalize(dog)} can join its wait list, or you can remove ${dog} from ${cls}.`
      : `${capitalize(cls)} just filled, so nothing was charged. Remove ${dog} from ${cls} to continue.`;
  }

  const list = named.map(({ dog, cls }) => `${dog} in ${cls}`).join(', ');
  return named.some(({ line }) => line.allow_waitlist && !line.denial_reason)
    ? `Spots just filled for ${list}, so nothing was charged. Your cart shows which can join a wait list; remove the others to continue.`
    : `Spots just filled for ${list}, so nothing was charged. Remove them from your cart to continue.`;
}
