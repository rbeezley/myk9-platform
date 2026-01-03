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

export { Badge, badgeVariants };
