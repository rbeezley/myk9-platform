import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

// Wrapper to maintain Radix API compatibility
// Base UI: onCheckedChange(checked, eventDetails) -> Radix: onCheckedChange(checked)
interface CheckboxProps extends Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  'onCheckedChange' | 'checked'
> {
  checked?: boolean | undefined;
  onChange?: ((checked: boolean) => void) | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
}

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, onChange, onCheckedChange, ...props }, ref) => {
    const handleCheckedChange = React.useCallback(
      (checked: boolean) => {
        onCheckedChange?.(checked);
        onChange?.(checked);
      },
      [onChange, onCheckedChange]
    );

    // Filter out undefined optional properties for exactOptionalPropertyTypes
    const filteredProps = Object.fromEntries(
      Object.entries(props).filter(([, v]) => v !== undefined)
    );

    return (
      <CheckboxPrimitive.Root
        ref={ref}
        className={cn(
          // INTENT: Checkbox.Root renders a <span>, which is display:inline — the
          // check then sits on the text baseline and stretches to its container in
          // a table header. inline-flex is what actually centres and sizes it.
          'peer inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[checked]:text-primary-foreground',
          className
        )}
        onCheckedChange={handleCheckedChange}
        {...filteredProps}
      >
        <CheckboxPrimitive.Indicator
          className={cn('inline-flex h-full w-full items-center justify-center text-current')}
          keepMounted={false}
        >
          {/* Sized from the root's content box, never a literal: box-sizing is
              border-box, so a caller that shrinks the root (ClassSelectionStep
              passes h-3.5) leaves a content box 2px smaller than the declared
              size, and any hardcoded icon overflows it on all four sides. */}
          <Check className="h-full w-full" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  }
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
