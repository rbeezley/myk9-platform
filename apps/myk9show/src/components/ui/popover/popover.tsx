import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '@/lib/utils';
import { getNativeButtonProp } from '@/components/ui/base-ui-native-button';

const Popover = PopoverPrimitive.Root;

/**
 * Input types that accept typed text. `button`/`checkbox`/`radio`/`submit`/
 * `reset`/`file`/`image`/`range`/`color` are deliberately absent: those DO want
 * Space-as-activation.
 */
const TEXT_ENTRY_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
]);

/** True when the element is something a person types characters into. */
export function isTextEntryElement(element: EventTarget | null): boolean {
  if (element === null || typeof HTMLElement === 'undefined') return false;
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return TEXT_ENTRY_INPUT_TYPES.has(element.type);
  // `isContentEditable` is undefined in jsdom, so fall back to the attribute.
  if (element.isContentEditable === true) return true;
  const editable = element.getAttribute('contenteditable');
  return editable === '' || editable === 'true' || editable === 'plaintext-only';
}

/** Base UI adds `preventBaseUIHandler` to synthetic events it merges handlers onto. */
type PreventableKeyboardEvent = React.KeyboardEvent<HTMLElement> & {
  preventBaseUIHandler?: () => void;
};

interface PopoverTriggerProps extends React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Trigger
> {
  asChild?: boolean;
  nativeButton?: boolean;
}

const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
  ({ asChild, children, nativeButton, onKeyDown, ...props }, ref) => {
    // MYK9-567: a combobox renders its text input AS the popover trigger. For a
    // non-native trigger Base UI emulates button activation, which means
    // `preventDefault()` on the Space keydown — so the space character never
    // reaches the field and "Mariana Alexander" is stored as
    // "MarianaAlexander". A text field never wants Space-as-activation, so stop
    // Base UI's key handler for one. Non-text triggers are untouched.
    const handleKeyDown = React.useCallback(
      (event: PreventableKeyboardEvent) => {
        (onKeyDown as ((e: PreventableKeyboardEvent) => void) | undefined)?.(event);
        if (event.key === ' ' && isTextEntryElement(event.currentTarget)) {
          event.preventBaseUIHandler?.();
        }
      },
      [onKeyDown]
    );

    if (asChild && React.isValidElement(children)) {
      return (
        <PopoverPrimitive.Trigger
          render={children}
          nativeButton={getNativeButtonProp(children, nativeButton)}
          onKeyDown={handleKeyDown}
          {...props}
        />
      );
    }
    return (
      <PopoverPrimitive.Trigger ref={ref} onKeyDown={handleKeyDown} {...props}>
        {children}
      </PopoverPrimitive.Trigger>
    );
  }
);
PopoverTrigger.displayName = 'PopoverTrigger';

// Base UI Popover doesn't have Anchor - create a no-op for API compatibility
const PopoverAnchor = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} {...props} />
);
PopoverAnchor.displayName = 'PopoverAnchor';

interface PopoverContentProps extends React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Popup
> {
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Popup>,
  PopoverContentProps
>(({ className, align = 'center', side, sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner
      align={align}
      {...(side && { side })}
      sideOffset={sideOffset}
      className="z-[100]"
    >
      <PopoverPrimitive.Popup
        ref={ref}
        className={cn(
          'z-[100] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
