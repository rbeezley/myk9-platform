import { cva } from 'class-variance-authority';

/**
 * Badge variants using class-variance-authority
 */
export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground border-border',
        // Status variants for dog show context
        success: 'border-transparent bg-success/10 text-success',
        warning: 'border-transparent bg-warning/10 text-warning',
        // myK9 specific status variants
        pending: 'border-status-pending/20 bg-status-pending/10 text-status-pending',
        approved: 'border-status-approved/20 bg-status-approved/10 text-status-approved',
        rejected: 'border-status-rejected/20 bg-status-rejected/10 text-status-rejected',
        draft: 'border-status-draft/20 bg-status-draft/10 text-status-draft',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);
