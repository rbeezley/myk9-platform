import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { getNativeButtonProp } from '@/components/ui/base-ui-native-button';

const AlertDialog = AlertDialogPrimitive.Root;

// Double-submit guard shared with AlertDialogAction. AlertDialogAction is a
// Close, so a click fires the caller's handler and begins dismissing. When the
// handler is async the popup stays mounted until it resolves (and Base UI keeps
// it mounted through the closing transition), so a second tap — or a tap after
// a fast programmatic reopen — would re-fire an irreversible action. The latch
// allows one invocation and resets whenever the dialog transitions to open, so
// every fresh confirmation works while accidental repeats do not.
const AlertDialogConfirmGuardContext = React.createContext<() => boolean>(() => true);

function AlertDialogConfirmGuard({ open, children }: { open: boolean; children: React.ReactNode }) {
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (open) firedRef.current = false;
  }, [open]);

  const tryFire = React.useCallback(() => {
    if (firedRef.current) return false;
    firedRef.current = true;
    return true;
  }, []);

  return (
    <AlertDialogConfirmGuardContext.Provider value={tryFire}>
      {children}
    </AlertDialogConfirmGuardContext.Provider>
  );
}

interface AlertDialogTriggerProps extends React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Trigger
> {
  asChild?: boolean;
  nativeButton?: boolean;
}

const AlertDialogTrigger = React.forwardRef<HTMLButtonElement, AlertDialogTriggerProps>(
  ({ asChild, children, nativeButton, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return (
        <AlertDialogPrimitive.Trigger
          render={children}
          nativeButton={getNativeButtonProp(children, nativeButton)}
          {...props}
        />
      );
    }
    return (
      <AlertDialogPrimitive.Trigger ref={ref} {...props}>
        {children}
      </AlertDialogPrimitive.Trigger>
    );
  }
);
AlertDialogTrigger.displayName = 'AlertDialogTrigger';

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Backdrop
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0',
      className
    )}
    {...props}
    ref={ref}
  />
));
AlertDialogOverlay.displayName = 'AlertDialogOverlay';

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Popup>
>(({ className, children, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Popup
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[open]:slide-in-from-left-1/2 data-[open]:slide-in-from-top-[48%] sm:rounded-lg',
        className
      )}
      {...props}
      render={(popupProps, state) => (
        <div {...popupProps}>
          <AlertDialogConfirmGuard open={state.open}>{children}</AlertDialogConfirmGuard>
        </div>
      )}
    />
  </AlertDialogPortal>
));
AlertDialogContent.displayName = 'AlertDialogContent';

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
);
AlertDialogHeader.displayName = 'AlertDialogHeader';

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
AlertDialogFooter.displayName = 'AlertDialogFooter';

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold', className)}
    {...props}
  />
));
AlertDialogTitle.displayName = 'AlertDialogTitle';

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, style, onClick, ...props }, ref) => {
  // The double-submit latch is owned by AlertDialogConfirmGuard (see its
  // definition) and reset per open, so a first tap fires and any repeat before
  // the dialog reopens is ignored.
  const tryFire = React.useContext(AlertDialogConfirmGuardContext);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!tryFire()) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <AlertDialogPrimitive.Close
      ref={ref}
      className={cn(buttonVariants({ size: 'lg' }), className)}
      {...(style !== undefined && { style })}
      onClick={handleClick}
      {...props}
    />
  );
});
AlertDialogAction.displayName = 'AlertDialogAction';

const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, style, ...props }, ref) => (
  <AlertDialogPrimitive.Close
    ref={ref}
    className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-2 sm:mt-0', className)}
    {...(style !== undefined && { style })}
    {...props}
  />
));
AlertDialogCancel.displayName = 'AlertDialogCancel';

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
