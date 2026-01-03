import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { cn } from '../../utils/cn';

const Dialog = DialogPrimitive.Root;

interface DialogTriggerProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger> {
  asChild?: boolean;
}

const DialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  DialogTriggerProps
>(({ asChild, children, ...props }, ref) => {
  // Convert asChild pattern to render prop for backwards compatibility
  if (asChild && React.isValidElement(children)) {
    return <DialogPrimitive.Trigger ref={ref} render={children} {...props} />;
  }
  return (
    <DialogPrimitive.Trigger ref={ref} {...props}>
      {children}
    </DialogPrimitive.Trigger>
  );
});
DialogTrigger.displayName = 'DialogTrigger';

const DialogPortal = DialogPrimitive.Portal;

interface DialogCloseProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close> {
  asChild?: boolean;
}

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  DialogCloseProps
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
DialogClose.displayName = 'DialogClose';

const DialogBackdrop = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80',
      'data-[open]:animate-fade-in data-[closed]:animate-fade-out',
      className
    )}
    {...props}
  />
));
DialogBackdrop.displayName = 'DialogBackdrop';

// Alias for backwards compatibility
const DialogOverlay = DialogBackdrop;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> {
  /** Whether to show the close button. Default: true */
  showCloseButton?: boolean;
  /** Custom close button content */
  closeButton?: React.ReactNode;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  DialogContentProps
>(({ className, children, showCloseButton = true, closeButton, ...props }, ref) => (
  <DialogPortal>
    <DialogBackdrop />
    <DialogPrimitive.Popup
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg',
        'translate-x-[-50%] translate-y-[-50%]',
        'gap-4 border border-border bg-background p-6 shadow-dialog',
        'rounded-xl backdrop-blur-sm',
        'duration-200',
        'data-[open]:animate-fade-in data-[closed]:animate-fade-out',
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
            'disabled:pointer-events-none'
          )}
        >
          {closeButton || (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
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
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogBackdrop,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
