import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

// Wrapper to maintain Radix API compatibility
// Use generic to allow typed callbacks like (value: MyEnum) => void
// Note: Base UI Select.Root doesn't support ref forwarding
interface SelectProps<T extends string = string> extends Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>, 'onValueChange' | 'value' | 'defaultValue'> {
  onValueChange?: ((value: T) => void) | undefined
  value?: T | undefined
  defaultValue?: T | undefined
}

function Select<T extends string = string>({ onValueChange, value, defaultValue, ...props }: SelectProps<T>) {
  const handleValueChange = onValueChange
    ? (newValue: unknown) => onValueChange((newValue ?? '') as T)
    : undefined

  // Always pass value when caller provides it (even empty string) to maintain
  // consistent controlled state. Omitting value on empty strings caused React
  // "switching between controlled and uncontrolled" warnings.
  const isControlled = value !== undefined
  const normalizedDefaultValue = defaultValue === '' ? undefined : defaultValue

  return (
    <SelectPrimitive.Root
      {...(handleValueChange !== undefined && { onValueChange: handleValueChange })}
      {...(isControlled && { value })}
      {...(normalizedDefaultValue !== undefined && { defaultValue: normalizedDefaultValue })}
      {...props}
    />
  )
}
Select.displayName = "Select"

const SelectGroup = SelectPrimitive.Group

// Wrapper for SelectValue to support placeholder prop.
// Let Base UI render the selected item's text natively (from ItemText).
// Placeholder styling is handled by SelectTrigger's data-[placeholder] rule.
interface SelectValueProps extends Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>, 'placeholder'> {
  placeholder?: string | undefined
}

const SelectValue = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Value>,
  SelectValueProps
>(({ placeholder, className, children, ...props }, ref) => (
  <SelectPrimitive.Value
    ref={ref}
    {...(className !== undefined && { className })}
    {...(placeholder !== undefined && { placeholder })}
    {...props}
  >
    {children}
  </SelectPrimitive.Value>
))
SelectValue.displayName = "SelectValue"

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-[var(--dialog-input-bg)] dark:bg-[var(--dialog-input-bg)] px-3 py-2 text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = "SelectTrigger"

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpArrow>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpArrow>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpArrow
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpArrow>
))
SelectScrollUpButton.displayName = "SelectScrollUpButton"

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownArrow>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownArrow>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownArrow
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownArrow>
))
SelectScrollDownButton.displayName = "SelectScrollDownButton"

interface SelectContentProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Popup> {
  position?: "popper" | "item-aligned"
}

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Popup>,
  SelectContentProps
>(({ className, children, position = "popper", ...props }, ref) => {
  // className might be a string or a function in Base UI
  const classNameStr = typeof className === 'string' ? className : '';
  const hasDialogInputBg = classNameStr.includes('dialog-input-bg');
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Backdrop className="fixed inset-0 z-[9998]" />
      <SelectPrimitive.Positioner className="z-[9999] pointer-events-auto">
        <SelectPrimitive.Popup
          ref={ref}
          className={cn(
            "relative max-h-[var(--available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border text-popover-foreground shadow-lg bg-popover dark:bg-popover",
            position === "popper" &&
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <div
            className={cn(
              "p-1",
              hasDialogInputBg && "dialog-input-bg",
              position === "popper" && "w-full min-w-[var(--anchor-width)]"
            )}
          >
            {children}
          </div>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = "SelectContent"

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.GroupLabel>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.GroupLabel>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.GroupLabel
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", className)}
    {...props}
  />
))
SelectLabel.displayName = "SelectLabel"

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = "SelectItem"

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = "SelectSeparator"

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
