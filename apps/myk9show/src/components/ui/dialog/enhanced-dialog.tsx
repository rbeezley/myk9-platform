import * as React from 'react';
import {
  DialogContent as OriginalDialogContent,
  DialogHeader as OriginalDialogHeader,
  DialogTitle as OriginalDialogTitle,
} from './dialog';
import { cn } from '@/lib/utils';

// Enhanced DialogContent with proper light/dark mode backgrounds by default
const EnhancedDialogContent = React.forwardRef<
  React.ElementRef<typeof OriginalDialogContent>,
  React.ComponentPropsWithoutRef<typeof OriginalDialogContent>
>(({ className, children, ...props }, ref) => (
  <OriginalDialogContent
    ref={ref}
    className={cn(
      // Default light/dark mode backgrounds and borders
      'bg-card dark:bg-card border border-border',
      // Ensure text is visible
      'text-foreground',
      className
    )}
    {...props}
  >
    {children}
  </OriginalDialogContent>
));
EnhancedDialogContent.displayName = 'EnhancedDialogContent';

// Enhanced DialogHeader with proper styling
const EnhancedDialogHeader: React.FC<
  React.ComponentPropsWithoutRef<typeof OriginalDialogHeader>
> = ({ className, ...props }) => (
  <OriginalDialogHeader
    className={cn(
      // Ensure header content is visible
      'text-foreground',
      className
    )}
    {...props}
  />
);
EnhancedDialogHeader.displayName = 'EnhancedDialogHeader';

// Enhanced DialogTitle with proper text colors
const EnhancedDialogTitle = React.forwardRef<
  React.ElementRef<typeof OriginalDialogTitle>,
  React.ComponentPropsWithoutRef<typeof OriginalDialogTitle>
>(({ className, ...props }, ref) => (
  <OriginalDialogTitle
    ref={ref}
    className={cn(
      // Ensure title is always visible
      'text-foreground',
      className
    )}
    {...props}
  />
));
EnhancedDialogTitle.displayName = 'EnhancedDialogTitle';

export { EnhancedDialogContent, EnhancedDialogHeader, EnhancedDialogTitle };
