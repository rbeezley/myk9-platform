/**
 * Cart Item Card
 *
 * Displays a single cart item with dog, class, handler info, and removal option.
 * Used in the full cart review page for detailed display.
 */

import React from 'react';
import { Trash2, Dog, Users, Ruler } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CartItemWithDetails } from '@/stores/cartStore';

interface CartItemCardProps {
  item: CartItemWithDetails;
  onRemove: () => void;
  isRemoving?: boolean;
  className?: string;
}

export function CartItemCard({
  item,
  onRemove,
  isRemoving = false,
  className,
}: CartItemCardProps) {
  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const dogName = item.dog?.call_name || item.dog?.name || 'Unknown Dog';
  const dogBreed = item.dog?.breed || 'Unknown Breed';
  const className_ = item.class?.name || 'Unknown Class';
  const classLevel = item.class?.level;
  const handlerName = item.handler
    ? `${item.handler.first_name} ${item.handler.last_name}`
    : null;

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
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">{className_}</span>
              {classLevel && (
                <Badge variant="secondary" className="text-xs">
                  {classLevel}
                </Badge>
              )}
            </div>

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
            <span className="text-lg font-semibold">
              {formatCurrency(item.entry_fee_cents)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={isRemoving}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CartItemCard;
