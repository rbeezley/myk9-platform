import * as React from 'react';

import { cn } from '../../utils/cn';

const cardVariantStyles = {
  default: '',
  scored: 'border-teal-500/50 border-2',
  unscored: 'border-orange-400/60 border-2 shadow-[0_0_12px_rgba(251,146,60,0.15)]',
} as const;

type CardVariant = keyof typeof cardVariantStyles;

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  /**
   * Render a selection ring from the contrast-verified `--ring` token. Selection
   * is conveyed by the ring (offset border), not by color alone.
   */
  selected?: boolean;
  /**
   * Add a pointer/hover affordance for cards that behave as a control. The
   * caller still owns the click handler, role, and keyboard wiring.
   */
  interactive?: boolean;
}

/**
 * Card container component
 */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', selected, interactive, ...props }, ref) => (
    <div
      ref={ref}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        'rounded-xl border border-border/50 bg-card text-card-foreground shadow-card',
        'backdrop-blur-sm',
        cardVariantStyles[variant],
        interactive && 'cursor-pointer transition-shadow hover:shadow-card-hover',
        selected && 'ring-2 ring-ring ring-offset-2',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

/**
 * Card header section
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

/**
 * Card title
 */
const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

/**
 * Card description text
 */
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

/**
 * Card content section
 */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

/**
 * Card footer section
 */
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
