import { useEffect, useState } from 'react';
import { useCartStore } from '@/store/cartStore';
import { cartBelongsToRegistration } from '@/store/cartStore.helpers';

const TICK_MS = 30_000;

interface CartExpiredGateInput {
  /** Exhibitor mode only — staff flows never create a cart. */
  enabled: boolean;
  showId: string | null | undefined;
  exhibitorId: string | null | undefined;
}

/**
 * True when THIS registration's cart has passed `expires_at`.
 *
 * Feeds `proceedBlockedReason` so an expired cart cannot be submitted: the
 * store's `loadCart` would drop it and the checkout path would then rebuild a
 * cart from the stale in-memory selections, skipping the "choose your classes
 * again" the expiry notice promises.
 *
 * Two guards and a clock:
 *  - Ownership. `useCartStore` is a singleton and can hold another show's
 *    leftover cart; only a cart matching this show AND this exhibitor counts.
 *  - Mode. Staff flows never create a cart, so the gate is inert there.
 *  - `isExpired()` is a plain getter that only re-reads on a re-render, so a
 *    30s tick runs while an owned cart with an `expires_at` exists. Without it
 *    a cart that lapsed while the exhibitor sat on Payment would leave Submit
 *    enabled until some unrelated re-render.
 */
export function useCartExpiredGate({
  enabled,
  showId,
  exhibitorId,
}: CartExpiredGateInput): boolean {
  const cart = useCartStore(state => state.cart);
  const owned = enabled && cartBelongsToRegistration(cart, showId, exhibitorId);
  const expiresAt = owned ? (cart?.expires_at ?? null) : null;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setTick(value => value + 1), TICK_MS);
    return () => clearInterval(id);
  }, [expiresAt]);

  return owned && useCartStore.getState().isExpired();
}
