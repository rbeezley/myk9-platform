import { cva } from 'class-variance-authority';

/**
 * Button variants using class-variance-authority
 * Apple-inspired styling with myK9 Platform design tokens
 */
export const buttonVariants = cva(
  // Base button styling
  [
    // Layout and spacing
    'inline-flex items-center justify-center gap-2.5',
    'whitespace-nowrap',
    'font-semibold',
    'text-sm leading-tight',
    'tracking-tight',

    // Border radius and shadows
    'rounded-xl',
    'shadow-sm',

    // Focus states - enhanced for accessibility
    'focus-visible:outline-none',
    'focus-visible:ring-[3px]',
    'focus-visible:ring-primary/40',
    'focus-visible:ring-offset-2',
    'focus-visible:shadow-md',

    // Transitions
    'transition-all duration-200 ease-apple',

    // Hover/active micro-interactions - enhanced for visibility
    'hover:shadow-md hover:scale-[1.03]',
    'active:scale-[0.95] active:shadow-sm',

    // Disabled states
    'disabled:pointer-events-none',
    'disabled:opacity-50',
    'disabled:scale-100',
    'disabled:shadow-none',

    // Icon handling - slightly larger icons for better visibility
    '[&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        // Primary gradient button (Apple blue to purple)
        default:
          'bg-gradient-to-r from-[#007AFF] to-[#5856D6] text-white shadow-md hover:from-[#007AFF]/90 hover:to-[#5856D6]/90 hover:shadow-lg',
        // Destructive action
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        // Outline button
        outline:
          'border border-border/40 bg-background/50 backdrop-blur-sm shadow-sm hover:bg-background hover:border-border/60 hover:shadow-md',
        // Secondary button
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        // Ghost button
        ghost:
          'hover:bg-accent/50 hover:backdrop-blur-sm hover:text-accent-foreground hover:shadow-sm',
        // Link button
        link: 'text-primary underline-offset-4 hover:underline shadow-none hover:shadow-none hover:scale-100',
        // Premium/highlight button
        premium:
          'bg-yellow-500 hover:bg-yellow-600 text-primary-foreground font-bold shadow-sm',
      },
      size: {
        default: 'h-9 px-6 py-2.5',
        sm: 'h-8 rounded-lg px-4 text-xs',
        lg: 'h-11 rounded-xl px-8 text-base',
        icon: 'h-10 w-10 rounded-xl', // Increased from h-9 w-9 for better touch targets
        'icon-lg': 'h-11 w-11 min-w-[44px] min-h-[44px] rounded-xl', // Accessible 44px touch target
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
