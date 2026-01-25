import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { cn } from '../../utils/cn';

const Sheet = DialogPrimitive.Root;

interface SheetTriggerProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger> {
  asChild?: boolean;
}

const SheetTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  SheetTriggerProps
>(({ asChild, children, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return <DialogPrimitive.Trigger ref={ref} render={children} {...props} />;
  }
  return (
    <DialogPrimitive.Trigger ref={ref} {...props}>
      {children}
    </DialogPrimitive.Trigger>
  );
});
SheetTrigger.displayName = 'SheetTrigger';

const SheetPortal = DialogPrimitive.Portal;

interface SheetCloseProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close> {
  asChild?: boolean;
}

const SheetClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  SheetCloseProps
>(({ asChild, children, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return <DialogPrimitive.Close ref={ref} render={children} {...props} />;
  }
  return (
    <DialogPrimitive.Close ref={ref} {...props}>
      {children}
    </DialogPrimitive.Close>
  );
});
SheetClose.displayName = 'SheetClose';

const SheetBackdrop = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50',
      'data-[open]:animate-fade-in data-[closed]:animate-fade-out',
      className
    )}
    {...props}
  />
));
SheetBackdrop.displayName = 'SheetBackdrop';

// Alias for backwards compatibility
const SheetOverlay = SheetBackdrop;

type SheetSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

const sizeClasses: Record<SheetSize, string> = {
  sm: 'w-[400px]',
  md: 'w-[500px]',
  lg: 'w-[600px]',
  xl: 'w-[800px]',
  '2xl': 'w-[1000px]',
  full: 'w-full',
};

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> {
  /** Sheet width size */
  size?: SheetSize;
  /** Whether to show the close button. Default: true */
  showCloseButton?: boolean;
  /** Custom close button content */
  closeButton?: React.ReactNode;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  SheetContentProps
>(({ className, children, size = 'md', showCloseButton = true, closeButton, ...props }, ref) => (
  <SheetPortal>
    <SheetBackdrop />
    <DialogPrimitive.Popup
      ref={ref}
      className={cn(
        'fixed right-0 top-0 z-50 h-full',
        'flex flex-col',
        'border-l border-border bg-background shadow-dialog',
        'data-[open]:animate-sheet-slide-in data-[closed]:animate-sheet-slide-out',
        sizeClasses[size],
        'max-w-[95vw]',
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          className={cn(
            'absolute right-4 top-4 rounded-sm opacity-70',
            'ring-offset-background transition-opacity',
            'hover:opacity-100',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:pointer-events-none',
            'z-10'
          )}
        >
          {closeButton || (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          )}
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Popup>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 px-6 py-4',
      'border-b border-border',
      'flex-shrink-0',
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = 'SheetHeader';

const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex-1 overflow-y-auto px-6 py-4',
      className
    )}
    {...props}
  />
);
SheetBody.displayName = 'SheetBody';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      'px-6 py-4 border-t border-border',
      'flex-shrink-0',
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight pr-8', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetBackdrop,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};

export type { SheetSize };
