/**
 * Cart Summary
 *
 * Displays cart totals breakdown and checkout button.
 * Shows entry fees, platform fee, and total with expiration countdown.
 */


import { useNavigate } from 'react-router-dom';
import { Clock, CreditCard, AlertTriangle, ShoppingCart, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useCartStore } from '@/stores/cartStore';
import { useCartExpirationTimer } from '@/hooks/useCartExpirationTimer';

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
  const cart = useCartStore((state) => state.cart);
  const getTotalEntryFees = useCartStore((state) => state.getTotalEntryFees);
  const getPlatformFee = useCartStore((state) => state.getPlatformFee);
  const getTotalAmount = useCartStore((state) => state.getTotalAmount);
  const getItemCount = useCartStore((state) => state.getItemCount);

  const {
    timeRemainingFormatted,
    showWarning,
    showUrgentWarning,
    extendExpiration,
    percentRemaining,
  } = useCartExpirationTimer({
    onExpired: () => {
      // Redirect to browse shows when cart expires
      navigate('/browse-shows');
    },
  });

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const itemCount = getItemCount();
  const subtotal = getTotalEntryFees();
  const platformFee = getPlatformFee();
  const total = getTotalAmount();

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
      navigate('/browse-shows');
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
        {/* Expiration Warning */}
        {(showWarning || showUrgentWarning) && (
          <div
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg',
              showUrgentWarning
                ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900'
                : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900'
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
              className="flex-shrink-0"
            >
              Extend
            </Button>
          </div>
        )}

        {/* Expiration Progress (when not warning) */}
        {!showWarning && !showUrgentWarning && timeRemainingFormatted && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>Cart expires in</span>
              </div>
              <span className="font-medium">{timeRemainingFormatted}</span>
            </div>
            <Progress value={percentRemaining} className="h-1.5" />
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
            <span className="text-muted-foreground">Platform Fee (3%)</span>
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
      </CardContent>

      <CardFooter className="flex-col gap-2 pt-0">
        <Button
          onClick={handleCheckout}
          disabled={isCheckingOut || itemCount === 0}
          className="w-full"
          size="lg"
        >
          {isCheckingOut ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Proceed to Checkout
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={handleContinueShopping}
          className="w-full"
        >
          Continue Shopping
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardFooter>
    </Card>
  );
}

export default CartSummary;
