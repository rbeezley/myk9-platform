/**
 * Cart Summary
 *
 * Displays cart totals breakdown and checkout button.
 * Shows entry fees, platform fee, and total with expiration countdown.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, AlertTriangle, ShoppingCart, ArrowRight, Loader2, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useCartStore } from '@/store/cartStore';
import { calculatePlatformFeeCents, formatPlatformFeeLabel } from '@/store/cartStore.helpers';
import { usePlatformFeePercent } from '@/hooks/queries/usePlatformFeePercent';
import { useCartExpirationTimer } from '@/hooks/useCartExpirationTimer';
import { WithdrawalPolicyDisclosure } from '@/features/payments/WithdrawalPolicyDisclosure';

interface CartSummaryProps {
  onCheckout?: () => void;
  onContinueShopping?: () => void;
  isCheckingOut?: boolean;
  className?: string;
}

export function CartSummary({
  onCheckout,
  onContinueShopping,
  isCheckingOut = false,
  className,
}: CartSummaryProps) {
  const navigate = useNavigate();
  const cart = useCartStore(state => state.cart);
  const getTotalEntryFees = useCartStore(state => state.getTotalEntryFees);
  const getItemCount = useCartStore(state => state.getItemCount);
  const feePercent = usePlatformFeePercent();

  // INTENT: Entry carts are a calm flow, not a time-pressured checkout. We do
  // NOT surface a constant ticking countdown, and expiry must NOT strand the
  // user by redirecting to /shows mid-payment (UX walk remediation 4.B). The
  // timer still runs so we can show an ACTIONABLE heads-up (with one-tap Extend)
  // only as the hold nears its end — never a clock counting the whole time.
  const { timeRemainingFormatted, showWarning, showUrgentWarning, extendExpiration } =
    useCartExpirationTimer();

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  // exhibitor-ux-remediation (cart-integrity): a cart drafted before entries
  // closed must never let checkout proceed — the audit found a week-old draft
  // with a live "Pay and confirm" button for a show whose entries had closed.
  // No trial-timezone helper is wired to the cart join yet; comparing against
  // end-of-day local on entry_close_date matches the existing isPastShowEntry
  // convention elsewhere in the exhibitor surface. `Date.now()` is read once
  // via lazy useState init (matching MyEntryCard's `currentTime` pattern) —
  // reading it directly in the render body trips the React Compiler purity
  // rule (impure function during render).
  const [currentTime] = useState(() => Date.now());
  const entriesClosed = (() => {
    if (!cart?.show?.entry_close_date) return false;
    const closeDate = new Date(cart.show.entry_close_date);
    const endOfCloseDay = new Date(
      closeDate.getFullYear(),
      closeDate.getMonth(),
      closeDate.getDate() + 1
    );
    return endOfCloseDay.getTime() <= currentTime;
  })();

  const itemCount = getItemCount();
  const subtotal = getTotalEntryFees();
  // Recompute fee + total from the live rate (the store bakes the fallback
  // default; the server charges the platform_settings rate this hook reads).
  const platformFee = calculatePlatformFeeCents(subtotal, feePercent);
  const total = subtotal + platformFee;

  const handleCheckout = () => {
    if (onCheckout) {
      onCheckout();
    } else {
      // Default checkout behavior - navigate to checkout page
      navigate('/checkout');
    }
  };

  const handleContinueShopping = () => {
    if (onContinueShopping) {
      onContinueShopping();
    } else {
      navigate('/shows');
    }
  };

  if (!cart || itemCount === 0) {
    return null;
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Order Summary
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Entries-closed notice — takes priority over the hold-expiration
            warning; a closed show can never be paid for regardless of how
            much hold time remains. */}
        {entriesClosed && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
            <Lock className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Entries are closed for this show</p>
              <p className="text-xs mt-0.5">
                This entry can no longer be paid for online. Contact the trial secretary for
                late-entry help, or remove it and keep shopping.
              </p>
            </div>
          </div>
        )}

        {/* Expiration Warning */}
        {!entriesClosed && (showWarning || showUrgentWarning) && (
          <div
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg',
              showUrgentWarning
                ? 'bg-destructive/10 text-destructive border border-destructive/30 '
                : 'bg-warning/10 text-warning border border-warning/30 '
            )}
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {showUrgentWarning ? 'Cart expiring very soon!' : 'Cart will expire soon'}
              </p>
              <p className="text-xs mt-0.5">
                {timeRemainingFormatted} remaining - complete checkout or extend time
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => extendExpiration()}
              className="flex-shrink-0 min-h-[44px]"
            >
              Extend
            </Button>
          </div>
        )}

        <Separator />

        {/* Totals Breakdown */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Entry Fees ({itemCount} {itemCount === 1 ? 'entry' : 'entries'})
            </span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Platform Fee ({formatPlatformFeeLabel(feePercent)})
            </span>
            <span>{formatCurrency(platformFee)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Show Info */}
        {cart.show && (
          <div className="pt-2 text-sm text-muted-foreground">
            <p>
              Entering: <span className="font-medium text-foreground">{cart.show.name}</span>
            </p>
          </div>
        )}

        {/* Withdrawal refund policy — disclosed before payment */}
        {cart.show?.id && (
          <WithdrawalPolicyDisclosure showId={cart.show.id} className="pt-1" />
        )}
      </CardContent>

      <CardFooter className="flex-col gap-2 pt-0">
        <Button
          onClick={handleCheckout}
          disabled={isCheckingOut || itemCount === 0 || entriesClosed}
          className="w-full"
          size="lg"
        >
          {isCheckingOut ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : entriesClosed ? (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Entries closed — cannot pay online
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Pay {formatCurrency(total)} and confirm {itemCount === 1 ? 'entry' : 'entries'}
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleContinueShopping} className="w-full">
          Continue Shopping
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
}

export default CartSummary;
