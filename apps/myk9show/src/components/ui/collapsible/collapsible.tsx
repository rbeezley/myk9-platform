import React from 'react';
import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';
import { cn } from '@/lib/utils';
import { getNativeButtonProp } from '@/components/ui/base-ui-native-button';

const Collapsible = CollapsiblePrimitive.Root;

interface CollapsibleTriggerProps extends React.ComponentPropsWithoutRef<
  typeof CollapsiblePrimitive.Trigger
> {
  asChild?: boolean;
  nativeButton?: boolean;
}

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ className, children, asChild, nativeButton, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return (
        <CollapsiblePrimitive.Trigger
          render={children}
          nativeButton={getNativeButtonProp(children, nativeButton)}
          className={cn(
            'flex w-full items-center justify-between py-4 font-medium transition-all hover:underline [&[data-open]>svg]:rotate-180',
            className
          )}
          {...props}
        />
      );
    }
    return (
      <CollapsiblePrimitive.Trigger
        ref={ref}
        className={cn(
          'flex w-full items-center justify-between py-4 font-medium transition-all hover:underline [&[data-open]>svg]:rotate-180',
          className
        )}
        {...props}
      >
        {children}
      </CollapsiblePrimitive.Trigger>
    );
  }
);
CollapsibleTrigger.displayName = 'CollapsibleTrigger';

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Panel>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Panel>
>(({ className, children, ...props }, ref) => (
  <CollapsiblePrimitive.Panel
    ref={ref}
    className={cn(
      'h-[var(--collapsible-panel-height)] overflow-hidden text-sm transition-[height] duration-200 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0',
      className
    )}
    {...props}
  >
    <div className="pb-4 pt-0">{children}</div>
  </CollapsiblePrimitive.Panel>
));
CollapsibleContent.displayName = 'CollapsibleContent';

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
