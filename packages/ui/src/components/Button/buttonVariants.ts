import { cva } from 'class-variance-authority';

/**
 * Button variants using class-variance-authority
 * Apple-inspired styling with myK9 Platform design tokens
 */
export const buttonVariants = cva(
  // Base button styling
  [
    // Layout and spacing
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap',
    'font-medium', // 500 weight - matches myK9Q
    'text-sm',

    // Border radius - matches myK9Q (0.5rem = 8px)
    'rounded-lg',

    // Focus states
    'focus-visible:outline-none',
    'focus-visible:ring-2',
    'focus-visible:ring-primary/30',
    'focus-visible:ring-offset-1',

    // Transitions - matches myK9Q (150ms ease-out)
    'transition-all duration-150 ease-out',

    // Hover: subtle lift effect - matches myK9Q
    'hover:-translate-y-[1px]',
    'active:translate-y-0',

    // Disabled states
    'disabled:pointer-events-none',
    'disabled:opacity-50',
    'disabled:translate-y-0',

    // Icon handling
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        // Primary button - uses accent color from CSS variables (teal by default)
        default:
          'bg-primary text-primary-foreground hover:opacity-90',
        // Destructive action
        destructive:
          'bg-destructive text-destructive-foreground hover:opacity-90',
        // Outline button - matches myK9Q dialog-button-secondary
        outline:
          'border border-border bg-secondary text-secondary-foreground hover:bg-muted',
        // Secondary button - muted background
        secondary:
          'bg-muted text-muted-foreground hover:bg-muted/80',
        // Ghost button
        ghost:
          'hover:bg-muted hover:text-accent-foreground',
        // Link button
        link: 'text-primary underline-offset-4 hover:underline',
        // Premium/highlight button
        premium:
          'bg-yellow-500 hover:bg-yellow-600 text-primary-foreground font-bold',
      },
      size: {
        // Sizes matching myK9Q spacing tokens
        default: 'h-10 px-6 py-2', // Comfortable touch target
        sm: 'h-8 px-4 text-xs', // Compact areas
        lg: 'h-11 px-8 text-base', // Full touch compliance (44px)
        icon: 'h-10 w-10', // Square touch target
        'icon-lg': 'h-11 w-11 min-w-[44px] min-h-[44px]', // Accessible 44px touch target
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
