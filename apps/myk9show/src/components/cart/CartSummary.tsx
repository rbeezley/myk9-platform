/**
 * Cart Summary
 *
 * Displays cart totals breakdown and checkout button.
 * Shows entry fees, platform fee, and total with expiration countdown.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  AlertTriangle,
  AlertCircle,
  ShoppingCart,
  ArrowRight,
  Loader2,
  Lock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useCartStore } from '@/store/cartStore';
import { calculatePlatformFeeCents, formatPlatformFeeLabel } from '@/store/cartStore.helpers';
import { usePlatformFeePercent } from '@/hooks/queries/usePlatformFeePercent';
import { useCartExpirationTimer } from '@/hooks/useCartExpirationTimer';
import { WithdrawalPolicyDisclosure } from '@/features/payments/WithdrawalPolicyDisclosure';
import type { CartFulfillmentView } from '@/features/payments/cartFulfillmentView';

interface CartSummaryProps {
  onCheckout?: () => void;
  onContinueShopping?: () => void;
  isCheckingOut?: boolean;
  /**
   * Per-line fulfillment for this cart (MYK9-122). When supplied, only payable
   * lines are totalled and wait-list requests are disclosed separately, so the
   * amount shown here is the amount actually charged. Omit to total every line.
   */
  fulfillment?: CartFulfillmentView;
  /**
   * True when class availability could not be loaded at all. Distinguishes a
   * permanent failure from the transient "still loading" state, so the button
   * does not sit on a spinner label forever.
   */
  capacityUnavailable?: boolean;
  className?: string;
}

export function CartSummary({
  onCheckout,
  onContinueShopping,
  isCheckingOut = false,
  fulfillment,
  capacityUnavailable = false,
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
  //
  // This is an ADVISORY client gate; the authoritative close enforcement is the
  // server-side guard on entry submission (tracked as a deferred money-path
  // change in the exhibitor-ux-remediation tasks). It is deliberately evaluated
  // against the exhibitor's LOCAL calendar day, not the trial's timezone: the
  // cart's `shows` join carries only `entry_close_date` (a DATE with no time or
  // zone — timezone lives on `trials`), so trial-tz precision isn't available
  // here without new plumbing. For the real failure case (a cart days/weeks
  // past close) local vs trial tz is irrelevant; the only imprecision is a
  // sub-day window at the boundary for an exhibitor in a far-off timezone,
  // which the server guard closes authoritatively.
  //
  // `entry_close_date` is DATE-only ("2026-06-30"); `new Date(str)` parses it as
  // UTC midnight, so reading getFullYear/Month/Date in a timezone behind UTC
  // yields the PRIOR day and would disable checkout for the whole final entry
  // day. Parse it by its own Y/M/D components as a local calendar date so the
  // boundary is the start of the day AFTER the close date. A slow tick
  // re-evaluates so a cart left open across midnight self-corrects rather than
  // staying enabled until reload (Date.now() can't be read in the render body —
  // the React Compiler purity rule flags it).
  const [now, setNow] = useState(() => Date.now());
  const entryCloseDate = cart?.show?.entry_close_date ?? null;
  useEffect(() => {
    if (!entryCloseDate) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [entryCloseDate]);

  const entriesClosed = (() => {
    if (!entryCloseDate) return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(entryCloseDate);
    if (!match) return false;
    const [, year, month, day] = match;
    // Start of the day AFTER the close date, in the exhibitor's local time.
    const endOfCloseDay = new Date(Number(year), Number(month) - 1, Number(day) + 1);
    return endOfCloseDay.getTime() <= now;
  })();

  const itemCount = getItemCount();
  // MYK9-122: only payable lines may move the amount charged. A full class is a
  // wait-list REQUEST — it is disclosed on its own line at $0.00 due now, never
  // folded into the total and then silently dropped at checkout.
  const payableCount = fulfillment ? fulfillment.payableItems.length : itemCount;
  const waitlistCount = fulfillment?.waitlistItems.length ?? 0;
  const blockedCount = fulfillment?.blockedItems.length ?? 0;
  const subtotal = fulfillment ? fulfillment.payableSubtotalCents : getTotalEntryFees();
  // Recompute fee + total from the live rate (the store bakes the fallback
  // default; the server charges the platform_settings rate this hook reads).
  const platformFee = calculatePlatformFeeCents(subtotal, feePercent);
  const total = subtotal + platformFee;
  // Availability has not resolved yet, so the payable total is not final.
  const capacityUnknown = fulfillment ? !fulfillment.capacityKnown : false;
  const capacityPending = capacityUnknown && !capacityUnavailable;
  const capacityFailed = capacityUnknown && capacityUnavailable;
  const waitlistOnly = payableCount === 0 && waitlistCount > 0;

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

        {/* Full-but-blocked lines stop checkout, so say so before the button is
            pressed rather than after (MYK9-122). */}
        {blockedCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {blockedCount === 1 ? 'A class is' : `${blockedCount} classes are`} full and not
                accepting wait list entries
              </p>
              <p className="text-xs mt-0.5">
                Remove {blockedCount === 1 ? 'it' : 'them'} from your cart to continue to payment.
              </p>
            </div>
          </div>
        )}

        {/* Totals Breakdown */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Entry Fees ({payableCount} {payableCount === 1 ? 'entry' : 'entries'})
            </span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {waitlistCount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Wait list requests ({waitlistCount})</span>
              <span className="text-muted-foreground">No payment due</span>
            </div>
          )}
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
        {cart.show?.id && <WithdrawalPolicyDisclosure showId={cart.show.id} className="pt-1" />}
      </CardContent>

      <CardFooter className="flex-col gap-2 pt-0">
        <Button
          onClick={handleCheckout}
          disabled={
            isCheckingOut || itemCount === 0 || entriesClosed || blockedCount > 0 || capacityUnknown
          }
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
          ) : capacityPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Checking class availability…
            </>
          ) : capacityFailed ? (
            <>
              <AlertCircle className="h-4 w-4 mr-2" />
              Class availability unavailable — reload to try again
            </>
          ) : blockedCount > 0 ? (
            <>
              <AlertCircle className="h-4 w-4 mr-2" />
              Remove the full {blockedCount === 1 ? 'class' : 'classes'} to continue
            </>
          ) : waitlistOnly ? (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Join the wait list ({waitlistCount} {waitlistCount === 1 ? 'request' : 'requests'}) —
              no payment due
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Pay {formatCurrency(total)} and confirm {payableCount === 1 ? 'entry' : 'entries'}
              {waitlistCount > 0 &&
                ` · ${waitlistCount} wait list ${waitlistCount === 1 ? 'request' : 'requests'}`}
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleContinueShopping} className="min-h-11 w-full">
          Continue Shopping
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
}

export default CartSummary;
