// Server-side class gate for stripe-checkout (MYK9-656, acceptance criterion 3).
//
// The cart page drops closed or full lines when it loads (the
// `reconcile_cart_closed_classes` RPC), but a class can close between that load
// and the Pay click, and a direct call to stripe-checkout skips the page
// altogether. create_online_paid_entry gates fullness after payment (overflow
// is refunded) but never class closure, so without this a cancelled or already
// run class could be charged and entered.
//
// The rule is not restated here. `class_entry_availability` (migration
// 20260925004700) returns `self_service_block` per class, the same verdict the
// reconcile RPC drops lines on; this only decides which cart lines it applies
// to. Finish Payment lines (entry_id set) settle an entry that already exists
// and are never blocked, as in the reconcile.
//
// Refusing rather than deleting is deliberate: the client reloads the cart on
// a 409, and that reload's reconcile removes the lines AND tells the exhibitor
// which and why. Deleting here would remove them with no explanation.

import {
  errorCode,
  type CheckoutSessionLike,
  type CheckoutSessionsApi,
} from './priorCheckoutSession.ts';

export interface CartLineForClassGate {
  class_id: string;
  entry_id?: string | null;
}

export interface ClassAvailabilityForGate {
  class_id: string;
  self_service_block: string | null;
}

export const CART_CLASS_CLOSED_MESSAGE =
  'A class in your cart has closed or filled since you added it. Review your cart and try again.';

/** Class ids of the cart's NEW lines, the only ones the gate reads. */
export function newLineClassIds(items: readonly CartLineForClassGate[]): string[] {
  return [...new Set(items.filter(item => !item.entry_id).map(item => item.class_id))];
}

/** True when any new cart line is in a class self-service can no longer buy. */
export function cartHasBlockedClass(
  items: readonly CartLineForClassGate[],
  availability: readonly ClassAvailabilityForGate[]
): boolean {
  const blocked = new Set(
    availability.filter(row => row.self_service_block !== null).map(row => row.class_id)
  );
  return items.some(item => !item.entry_id && blocked.has(item.class_id));
}

export type PriorSessionRelease =
  { kind: 'released' } | { kind: 'blocked'; status: 409 | 503; error: string; diagnostic: string };

/**
 * Before the class gate's 409 hands the cart back for its reconcile, make sure
 * no Stripe page can still take payment for it (Codex P1 on PR #2438).
 *
 * `reconcile_cart_closed_classes` leaves any cart that still links a Checkout
 * Session untouched, because a live page (or a paid session whose webhook has
 * not run) could otherwise charge for lines the reconcile deleted. So the gate
 * resolves the linked session first:
 *
 *   complete        -> blocked 409: the payment is processing; the webhook
 *                      settles it (and refunds any line it cannot serve).
 *   open            -> expired, then released: the page can no longer pay.
 *   expired/missing -> released.
 *   anything else, or Stripe unreachable -> blocked 503, link kept.
 *
 * `released` means the caller may clear the cart's session link, after which
 * the reload's reconcile can drop the closed lines and explain them.
 */
export async function releasePriorSessionForClassGate(
  priorSessionId: string | null,
  sessions: CheckoutSessionsApi<CheckoutSessionLike>
): Promise<PriorSessionRelease> {
  if (!priorSessionId) return { kind: 'released' };

  const unsafe = (diagnostic: string): PriorSessionRelease => ({
    kind: 'blocked',
    status: 503,
    error: 'We could not safely update your cart. Please try again in a moment.',
    diagnostic,
  });

  let existing: CheckoutSessionLike | null = null;
  try {
    existing = await sessions.retrieve(priorSessionId);
  } catch (error) {
    if (errorCode(error) !== 'resource_missing') return unsafe(String(error));
  }

  if (!existing || existing.status === 'expired') return { kind: 'released' };

  if (existing.status === 'complete') {
    return {
      kind: 'blocked',
      status: 409,
      error:
        'Your payment for this cart is already processing. Give it a few seconds, then check My Entries.',
      diagnostic: `Checkout Session ${existing.id} is complete`,
    };
  }

  if (existing.status === 'open') {
    try {
      await sessions.expire(existing.id);
      return { kind: 'released' };
    } catch (error) {
      return unsafe(String(error));
    }
  }

  return unsafe(`Unexpected prior Checkout Session status: ${existing.status}`);
}
