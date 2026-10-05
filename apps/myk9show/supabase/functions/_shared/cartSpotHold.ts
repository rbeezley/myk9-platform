// Hold class spots while the exhibitor pays (MYK9-1012).
//
// ONE CHECKOUT PER CART AT A TIME. stripe-checkout first claims the cart's
// checkout lease (`claim_cart_checkout`, 90 seconds); a second Pay on the same
// cart while it is live gets `checkout_in_progress` and never runs alongside.
// Under the lease, in order: retire or reuse the old Stripe page, hold every
// new line (`hold_cart_spots`), open the page with the hold's expiry, then in
// ONE transaction link the page to the cart and tie the holds to it
// (`link_cart_checkout`), and finally end the lease (`end_cart_checkout`,
// which gives back any hold never tied to a page). Every hold write requires
// the live lease. Codex rounds 1 and 2 on #2755 each found a race between two
// Pay requests on one cart; the lease removes the second request instead of
// guarding each interleaving.
//
// The capacity rule is in the database (migration 20261005031700):
// `hold_cart_spots` decides each line under evaluate_entry_capacity's locks,
// so two carts racing for the last spot cannot both win, and it holds every
// line or none. When a line has no room nothing is charged: the caller answers
// 409 with `describeRefusedLines`.
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
  outcome: 'held' | 'refused' | 'cart_changed';
}

export type CartHoldResult =
  | { kind: 'held'; heldCount: number }
  | { kind: 'refused'; lines: RefusedCartLine[] }
  /** The cart is not the cart this request read (edited, or the page unlinked): nothing held. */
  | { kind: 'cart_changed' }
  | { kind: 'error'; message: string };

/** Epoch seconds for a hold starting now. */
export function cartSpotHoldUntilEpoch(nowMs: number): number {
  return Math.floor(nowMs / 1000) + CART_SPOT_HOLD_SECONDS;
}

export function epochToIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

/** This request's claim on one cart's checkout. */
export interface CartLease {
  cartId: string;
  leaseId: string;
}

export type CartLeaseClaim =
  { kind: 'claimed' } | { kind: 'in_progress' } | { kind: 'error'; message: string };

export const CHECKOUT_IN_PROGRESS_CODE = 'checkout_in_progress';

export const CHECKOUT_IN_PROGRESS_MESSAGE =
  'Checkout is already starting for this cart. One moment, then try again.';

/** Claim the cart's checkout, or learn that another request holds it. */
export async function claimCartCheckout(
  db: HoldRpcClient,
  lease: CartLease
): Promise<CartLeaseClaim> {
  const { data, error } = await db.rpc('claim_cart_checkout', {
    p_cart_id: lease.cartId,
    p_lease_id: lease.leaseId,
  });
  if (error) return { kind: 'error', message: error.message ?? 'claim_cart_checkout failed' };
  const outcome = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
  if (outcome?.outcome === 'claimed') return { kind: 'claimed' };
  if (outcome?.outcome === 'in_progress') return { kind: 'in_progress' };
  return { kind: 'error', message: `claim_cart_checkout answered ${JSON.stringify(data)}` };
}

/** End this request's checkout: untied holds go back and the cart is free. */
export async function endCartCheckout(
  db: HoldRpcClient,
  lease: CartLease
): Promise<{ error: string | null }> {
  const { error } = await db.rpc('end_cart_checkout', {
    p_cart_id: lease.cartId,
    p_lease_id: lease.leaseId,
  });
  return { error: error ? (error.message ?? 'end_cart_checkout failed') : null };
}

/**
 * Hold every new line of the cart under the lease, or hold nothing.
 * `expectedUpdatedAt` is the cart's updated_at as this request read it; the
 * database refuses (`cart_changed`) unless the cart is still that cart.
 * `sessionId` names the page the holds are for when it already exists (a
 * reused page, which the cart must still link); otherwise the page is opened
 * next and `linkCartCheckout` ties them to it.
 */
export async function holdCartSpots(
  db: HoldRpcClient,
  lease: CartLease,
  expiresAtEpoch: number,
  expectedUpdatedAt: string,
  sessionId: string | null = null
): Promise<CartHoldResult> {
  const { data, error } = await db.rpc('hold_cart_spots', {
    p_cart_id: lease.cartId,
    p_lease_id: lease.leaseId,
    p_expires_at: epochToIso(expiresAtEpoch),
    p_expected_updated_at: expectedUpdatedAt,
    p_checkout_session_id: sessionId,
  });
  if (error) return { kind: 'error', message: error.message ?? 'hold_cart_spots failed' };
  const rows = (Array.isArray(data) ? data : []) as HoldRow[];
  if (rows.some(row => row.outcome === 'cart_changed')) return { kind: 'cart_changed' };
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

export interface CheckoutLink {
  sessionId: string;
  sessionExpiresAtEpoch: number;
  /** The cart's updated_at as this request read it, under the lease. */
  expectedUpdatedAt: string;
  heldCount: number;
  subtotalCents: number;
  platformFeeCents: number;
  totalCents: number;
}

export type CheckoutLinkOutcome =
  | { kind: 'linked' }
  | { kind: 'cart_changed' }
  | { kind: 'holds_lost' }
  | { kind: 'error'; message: string };

/**
 * In one transaction: link the page to the (unchanged) cart and tie every
 * held line to it, ending when the page does. Only `linked` may hand the
 * page out.
 */
export async function linkCartCheckout(
  db: HoldRpcClient,
  lease: CartLease,
  link: CheckoutLink
): Promise<CheckoutLinkOutcome> {
  const { data, error } = await db.rpc('link_cart_checkout', {
    p_cart_id: lease.cartId,
    p_lease_id: lease.leaseId,
    p_checkout_session_id: link.sessionId,
    p_expires_at: epochToIso(link.sessionExpiresAtEpoch),
    p_expected_updated_at: link.expectedUpdatedAt,
    p_held_count: link.heldCount,
    p_subtotal_cents: link.subtotalCents,
    p_platform_fee_cents: link.platformFeeCents,
    p_total_cents: link.totalCents,
  });
  if (error) return { kind: 'error', message: error.message ?? 'link_cart_checkout failed' };
  if (data === 'linked' || data === 'cart_changed' || data === 'holds_lost') return { kind: data };
  return { kind: 'error', message: `link_cart_checkout answered ${JSON.stringify(data)}` };
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

/** The cart was edited (another tab) after this request read it: start over. */
export class CartChangedError extends Error {
  constructor() {
    super('cart changed since checkout read it');
    this.name = 'CartChangedError';
  }
}

export const CART_CHANGED_MESSAGE =
  'Your cart changed while checkout was starting. Please try again.';

export const CART_HOLD_UNAVAILABLE_MESSAGE =
  'We could not hold your spots just now. Nothing was charged. Please try again in a moment.';

/**
 * Hold first, then open the page with the hold's expiry. Nothing to undo
 * here when the page fails to open: ending the lease gives untied holds back.
 */
export async function createSessionUnderHold<T>(
  db: HoldRpcClient,
  lease: CartLease,
  holdUntilEpoch: number,
  expectedUpdatedAt: string,
  createSession: (expiresAtEpoch: number) => Promise<T>
): Promise<{ session: T; heldCount: number }> {
  const hold = await holdCartSpots(db, lease, holdUntilEpoch, expectedUpdatedAt);
  if (hold.kind === 'refused') throw new CartHoldRefusedError(hold.lines);
  if (hold.kind === 'cart_changed') throw new CartChangedError();
  if (hold.kind === 'error') throw new CartHoldUnavailableError(hold.message);
  return { session: await createSession(holdUntilEpoch), heldCount: hold.heldCount };
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
