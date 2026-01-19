/**
 * Cart Preview Panel
 *
 * Displays a sidebar panel showing current cart items, totals, and expiration countdown.
 * Used in the registration workflow to show items being added.
 */


import { ShoppingCart, Clock, Trash2, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useCartStore, useCartItems, useCartTotal, type CartItemWithDetails } from '@/stores/cartStore';
import { useCartExpirationTimer } from '@/hooks/useCartExpirationTimer';
import { useDogStore } from '@/store/dogStore';

interface CartPreviewPanelProps {
  onCheckout?: () => void;
  onContinueShopping?: () => void;
  onViewCart?: () => void;
  showFullDetails?: boolean;
  className?: string;
}

export function CartPreviewPanel({
  onCheckout,
  onContinueShopping,
  onViewCart,
  showFullDetails = false,
  className,
}: CartPreviewPanelProps) {
  const cart = useCartStore((state) => state.cart);
  const items = useCartItems();
  const totalCents = useCartTotal();
  const removeItem = useCartStore((state) => state.removeItem);
  const getTotalEntryFees = useCartStore((state) => state.getTotalEntryFees);
  const getPlatformFee = useCartStore((state) => state.getPlatformFee);

  const {
    timeRemainingFormatted,
    showWarning,
    showUrgentWarning,
    extendExpiration,
    percentRemaining,
  } = useCartExpirationTimer({
    onExpired: () => {
      // TODO: Trigger a modal or redirect when cart expires
    },
  });

  const { dogs = [] } = useDogStore();

  const getDogName = (dogId: string) => {
    const dog = dogs.find((d) => d.id === dogId);
    return dog?.callName || dog?.name || 'Unknown Dog';
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (!cart || items.length === 0) {
    return (
      <Card className={cn('', className)}>
        <CardContent className="py-8 text-center">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Your cart is empty</p>
          <p className="text-xs text-muted-foreground mt-1">
            Select classes to add them to your cart
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Your Cart
            <Badge variant="secondary" className="ml-1">
              {items.length}
            </Badge>
          </CardTitle>
          {onViewCart && (
            <Button variant="ghost" size="sm" onClick={onViewCart} className="text-xs">
              View Full Cart
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>

        {/* Expiration Warning */}
        {(showWarning || showUrgentWarning) && (
          <div
            className={cn(
              'flex items-center gap-2 p-2 rounded-md mt-2',
              showUrgentWarning
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            )}
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <div className="flex-1 text-xs">
              <span className="font-medium">
                {showUrgentWarning ? 'Expiring soon!' : 'Cart expiring'}
              </span>
              <span className="ml-1">{timeRemainingFormatted} remaining</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => extendExpiration()}
              className="h-6 text-xs"
            >
              Extend
            </Button>
          </div>
        )}

        {/* Expiration Progress Bar */}
        {!showWarning && !showUrgentWarning && (
          <div className="flex items-center gap-2 mt-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <Progress value={percentRemaining} className="h-1 flex-1" />
            <span className="text-xs text-muted-foreground">{timeRemainingFormatted}</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="pb-3">
        <ScrollArea className={cn('pr-3', showFullDetails ? 'h-[300px]' : 'h-[150px]')}>
          <div className="space-y-2">
            {items.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                dogName={getDogName(item.dog_id)}
                showFullDetails={showFullDetails}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </div>
        </ScrollArea>

        <Separator className="my-3" />

        {/* Totals */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Entry Fees</span>
            <span>{formatCurrency(getTotalEntryFees())}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Platform Fee (3%)</span>
            <span>{formatCurrency(getPlatformFee())}</span>
          </div>
          <div className="flex justify-between font-semibold pt-1 border-t">
            <span>Total</span>
            <span>{formatCurrency(totalCents)}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex-col gap-2 pt-0">
        {onCheckout && (
          <Button onClick={onCheckout} className="w-full">
            Proceed to Checkout
          </Button>
        )}
        {onContinueShopping && (
          <Button variant="outline" onClick={onContinueShopping} className="w-full">
            Continue Shopping
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

interface CartItemRowProps {
  item: CartItemWithDetails;
  dogName: string;
  showFullDetails?: boolean;
  onRemove: () => void;
}

function CartItemRow({ item, dogName, showFullDetails, onRemove }: CartItemRowProps) {
  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium text-sm truncate">{dogName}</span>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {item.class?.name || 'Unknown Class'}
          {item.class?.level && ` - ${item.class.level}`}
        </div>
        {showFullDetails && item.handler && (
          <div className="text-xs text-muted-foreground">
            Handler: {item.handler.first_name} {item.handler.last_name}
          </div>
        )}
        {showFullDetails && item.jump_height && (
          <div className="text-xs text-muted-foreground">Height: {item.jump_height}</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{formatCurrency(item.entry_fee_cents)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default CartPreviewPanel;
