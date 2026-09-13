import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCartExpiration, useCartStore } from '@/store/cartStore';
import { cartBelongsToRegistration, EXPIRATION_WARNING_MINUTES } from '@/store/cartStore.helpers';

/** A part-minute still has time left in it, so round up: 30s reads "1 minute". */
function minutesLeft(timeRemainingMs: number): number {
  return Math.max(1, Math.ceil(timeRemainingMs / 60_000));
}

/** Coarse enough to cost nothing, fine enough that a minute count never lies. */
const TICK_MS = 30_000;

export interface CartExpiryNoticeProps {
  /** The show this wizard is registering for. */
  showId?: string | null | undefined;
  /** The exhibitor the cart is held for — the on-behalf one in staff flows. */
  exhibitorId?: string | null | undefined;
  /** Injectable for tests, so asserting the click needs no real navigation. */
  reload?: (() => void) | undefined;
}

/**
 * The cart's expiry, said out loud (entry-wizard-guidance — "An expiring cart is
 * announced before it expires").
 *
 * `cartStore` has computed `expirationWarning` and `isExpired` all along with
 * nothing rendering them, so an exhibitor's held classes could lapse mid-wizard
 * and the next screen would simply look as if they had chosen nothing.
 *
 * The store has no clock of its own: `expirationWarning` is set once, when the
 * cart loads, and `getTimeUntilExpiration()` is a getter that only re-reads when
 * something re-renders. So the tick is here, and it is the whole mechanism —
 * a counter that re-renders this component while a cart with an `expires_at`
 * exists, which makes the store's own getters recompute. No store logic, no new
 * data path, cleared on unmount.
 *
 * Recovery is a RELOAD, not a hand-built state reset, and that is deliberate.
 * Four review rounds of a bespoke restart each opened a new cart-lifecycle race:
 * navigate-then-clear left stale selections that re-added as duplicates; then an
 * awaited `abandonCart` left Payment live and submittable over an emptied entry;
 * then the fire-and-forget release raced the replacement cart's own
 * `loadCart`/`createCart` and could null the NEW cart. A fresh boot has none of
 * those orderings to get wrong: `loadCart` already filters `expires_at > now` so
 * the dead cart is simply not found, the wizard's selections and step-completion
 * are React state and vanish with the unmount, and no `abandonCart` is owed
 * because the cart is already dead server-side.
 *
 * INTENT: exhibitor — the flow must never lose work silently.
 */
export const CartExpiryNotice: React.FC<CartExpiryNoticeProps> = ({
  showId,
  exhibitorId,
  reload = () => window.location.reload(),
}) => {
  const { expiresAt, timeRemaining, isExpired, isWarning } = useCartExpiration();
  // The store is a singleton and may still hold a previous show's expired cart
  // (see `cartBelongsToRegistration`). Announcing that as this registration's
  // expiry tells the exhibitor their work lapsed when it did not.
  const isOwnCart = useCartStore(state =>
    cartBelongsToRegistration(state.cart, showId, exhibitorId)
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    // No cart, or a cart with no expiry: nothing can count down, so no timer.
    if (!expiresAt || !isOwnCart) return;
    const id = setInterval(() => setTick(value => value + 1), TICK_MS);
    return () => clearInterval(id);
  }, [expiresAt, isOwnCart]);

  if (!isOwnCart) return null;

  if (isExpired) {
    return (
      <Alert variant="destructive" role="status" data-testid="cart-expiry-notice">
        <Clock className="h-4 w-4" />
        <AlertDescription className="space-y-2">
          <p>Your selections expired — nothing has been entered or charged.</p>
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="min-h-11"
            onClick={reload}
          >
            Start again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (timeRemaining === null) return null;
  // The store's flag is only set at load time, so a cart that crosses into the
  // window while the wizard is open would never announce itself on the flag
  // alone. The threshold is the store's own constant, not a second opinion.
  const inWarningWindow = isWarning || timeRemaining < EXPIRATION_WARNING_MINUTES * 60 * 1000;
  if (!inWarningWindow) return null;

  const minutes = minutesLeft(timeRemaining);
  return (
    <Alert role="status" data-testid="cart-expiry-notice">
      <Clock className="h-4 w-4" />
      <AlertDescription>
        {minutes} minute{minutes === 1 ? '' : 's'} left to finish. After that your selections are
        released and you will need to choose your classes again.
      </AlertDescription>
    </Alert>
  );
};
