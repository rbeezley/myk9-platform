/**
 * The exhibitor's side of holding spots at Pay (MYK9-1012).
 *
 * stripe-checkout holds every new cart line's spot before it opens the Stripe
 * page, and the page expires when the hold does (`_shared/cartSpotHold.ts`).
 * Here: the one line the Pay step says about it, and how a return from an
 * expired page is told apart from a plain cancel. The server answers each Pay
 * with `holdExpiresAt`; it is kept in sessionStorage across the round trip to
 * Stripe (same tab), and a cancel landing after that instant means the page
 * ran out, not that the exhibitor backed out.
 *
 * Copy is owner-approved. Nothing here is shown to anyone but the exhibitor
 * who paid: other exhibitors see a held spot as an ordinary Full class.
 */
import { STORAGE_KEYS } from '@/constants/storageKeys';

export const CHECKOUT_HOLD_PAY_LINE = "We're holding your spots for 30 minutes while you pay.";

export const CHECKOUT_HOLD_ENDED_MESSAGE =
  'Your 30-minute hold ended. Your cart is saved; check out again to re-check spots.';

interface StoredCheckoutHold {
  sessionId: string;
  holdExpiresAt: string;
}

/** Remember the hold the server just took for this Stripe page. */
export function rememberCheckoutHold(
  sessionId: string | null | undefined,
  holdExpiresAt: string | null | undefined
): void {
  if (!sessionId || !holdExpiresAt || Number.isNaN(Date.parse(holdExpiresAt))) return;
  try {
    const stored: StoredCheckoutHold = { sessionId, holdExpiresAt };
    sessionStorage.setItem(STORAGE_KEYS.CHECKOUT_HOLD, JSON.stringify(stored));
  } catch {
    // sessionStorage can be unavailable; the cancel landing then reads as a
    // plain cancel, which is still true about the charge.
  }
}

function readCheckoutHold(): StoredCheckoutHold | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.CHECKOUT_HOLD);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCheckoutHold>;
    if (typeof parsed.sessionId !== 'string' || typeof parsed.holdExpiresAt !== 'string') {
      return null;
    }
    return { sessionId: parsed.sessionId, holdExpiresAt: parsed.holdExpiresAt };
  } catch {
    return null;
  }
}

/**
 * True when the last checkout's hold has ended by `nowMs`. With a session id
 * (the cancel landing has one) only that page's hold counts; without one (the
 * cart, reached from that landing) the last page's.
 */
export function checkoutHoldEnded(nowMs: number, sessionId?: string | null): boolean {
  const hold = readCheckoutHold();
  if (!hold) return false;
  if (sessionId && hold.sessionId !== sessionId) return false;
  const endsAt = Date.parse(hold.holdExpiresAt);
  return !Number.isNaN(endsAt) && endsAt <= nowMs;
}
