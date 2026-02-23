import * as React from 'react';
import { type VariantProps } from 'class-variance-authority';

import { cn } from '../../utils/cn';
import { badgeVariants } from './badgeVariants';

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge component for displaying status, labels, or counts.
 *
 * @example
 * // Default badge
 * <Badge>New</Badge>
 *
 * @example
 * // Status badges
 * <Badge variant="success">Approved</Badge>
 * <Badge variant="pending">Pending</Badge>
 *
 * @example
 * // Outline badge
 * <Badge variant="outline">v1.0</Badge>
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/**
 * ArmbandBadge — circular 44x44px badge for displaying armband numbers.
 * Designed for dog show entry identification with accessible touch target sizing.
 *
 * @example
 * <ArmbandBadge number={42} />
 * <ArmbandBadge number={7} size="lg" />
 */
interface ArmbandBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  number: number | string;
  size?: 'default' | 'lg';
}

function ArmbandBadge({ number, size = 'default', className, ...props }: ArmbandBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full',
        'bg-primary text-primary-foreground font-bold',
        'border-2 border-primary/20',
        size === 'default' && 'h-11 w-11 min-w-[44px] min-h-[44px] text-sm',
        size === 'lg' && 'h-14 w-14 min-w-[56px] min-h-[56px] text-base',
        className
      )}
      aria-label={`Armband number ${number}`}
      {...props}
    >
      {number}
    </div>
  );
}

export { Badge, badgeVariants, ArmbandBadge };
export type { ArmbandBadgeProps };
