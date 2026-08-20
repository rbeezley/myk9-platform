/**
 * Cart Item Card
 *
 * Displays a single cart item with dog, class, handler info, and removal option.
 * Used in the full cart review page for detailed display.
 */

import { Trash2, Dog, Users, Ruler, Loader2 } from 'lucide-react';
import { getDogBreedLabel } from '@/types/dog-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCartCurrency } from '@/store/cartStore.helpers';
import type { CartItemWithDetails } from '@/store/cartStore';
import type { CartItemFulfillment } from '@/features/payments/cartFulfillmentView';

interface CartItemCardProps {
  item: CartItemWithDetails;
  onRemove: () => void;
  isRemoving?: boolean;
  /**
   * How this line will actually be fulfilled at checkout (MYK9-122). Defaults to
   * 'payable' so callers that have no capacity context are unchanged.
   */
  fulfillment?: CartItemFulfillment;
  className?: string;
}

/**
 * Badge surfaces that survive dark mode.
 *
 * `variant="secondary"` was invisible there: `--secondary`, `--card` and
 * `--secondary-foreground`/`--card-foreground` are all pairwise identical in
 * `.dark` (#1e1c19 / #faf7f2), and the variant sets `border-transparent` - so
 * the pill had no fill, no border and no distinguishing text color, and
 * "Wait list request" rendered as plain body text beside the class name at
 * 1.00:1. That badge is the only per-line cue that a line will NOT be charged,
 * which is precisely the signal that must not disappear. The blocked badge
 * (`destructive`) kept its fill, so the hard-stop state survived while the
 * softer money-relevant one did not.
 *
 * The wait-list badge takes the warning family, matching its meaning and
 * measuring 6.08:1 light / 8.27:1 dark; the level badge just needs a real
 * boundary.
 */
const WAITLIST_BADGE = 'border-warning/40 bg-warning/10 text-warning';
const LEVEL_BADGE = 'border-border text-muted-foreground';

export function CartItemCard({
  item,
  onRemove,
  isRemoving = false,
  fulfillment = 'payable',
  className,
}: CartItemCardProps) {
  const isWaitlist = fulfillment === 'waitlist';
  const isBlocked = fulfillment === 'blocked';

  const dogName = item.dog?.call_name || item.dog?.name || 'Unknown Dog';
  const dogBreed = getDogBreedLabel({ registrations: item.dog?.registrations });
  const className_ = item.class?.name || 'Unknown Class';
  const classLevel = item.class?.level;
  const handlerName = item.handler ? `${item.handler.first_name} ${item.handler.last_name}` : null;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Dog Icon */}
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Dog className="h-6 w-6 text-primary" />
          </div>

          {/* Item Details */}
          <div className="flex-1 min-w-0">
            {/* Dog Name and Breed */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-base truncate">{dogName}</h3>
              <span className="text-sm text-muted-foreground">({dogBreed})</span>
            </div>

            {/* Class Name and Level */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-medium">{className_}</span>
              {classLevel && (
                <Badge variant="outline" className={cn('text-xs', LEVEL_BADGE)}>
                  {classLevel}
                </Badge>
              )}
              {isWaitlist && (
                <Badge variant="outline" className={cn('text-xs', WAITLIST_BADGE)}>
                  Wait list request
                </Badge>
              )}
              {isBlocked && (
                <Badge variant="destructive" className="text-xs">
                  Class full
                </Badge>
              )}
            </div>

            {/* INTENT: a full class must never read as a quietly-included entry.
                Say plainly what will happen and what it costs, at the line
                itself — not only after the exhibitor commits to checkout. */}
            {isWaitlist && (
              <p className="mb-2 text-sm text-muted-foreground">
                This class is full. We&apos;ll hold your place on the wait list. Availability is
                confirmed before any payment is requested.
              </p>
            )}
            {isBlocked && (
              <p className="mb-2 text-sm text-destructive">
                This class is full and is not accepting wait list entries. Remove it to continue to
                payment.
              </p>
            )}

            {/* Additional Details */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {handlerName && (
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>Handler: {handlerName}</span>
                </div>
              )}
              {item.jump_height && (
                <div className="flex items-center gap-1">
                  <Ruler className="h-3.5 w-3.5" />
                  <span>Height: {item.jump_height}</span>
                </div>
              )}
            </div>

            {/* Special Requests */}
            {item.special_requests && (
              <div className="mt-2 text-sm text-muted-foreground italic">
                Note: {item.special_requests}
              </div>
            )}
          </div>

          {/* Price and Remove */}
          <div className="flex flex-col items-end gap-2">
            {isWaitlist || isBlocked ? (
              <span className="text-right">
                <span className="block text-lg font-semibold">
                  {isWaitlist ? 'Pending' : <span aria-hidden="true">-</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {isWaitlist ? 'Amount confirmed at submission' : 'Cannot be paid'}
                </span>
              </span>
            ) : (
              <span className="text-lg font-semibold">
                {formatCartCurrency(item.entry_fee_cents)}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={isRemoving}
              className="min-h-[44px] text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              {isRemoving ? 'Removing' : 'Remove'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CartItemCard;
