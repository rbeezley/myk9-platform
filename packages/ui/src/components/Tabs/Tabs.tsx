"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "../../utils/cn"

// Wrapper to maintain Radix API compatibility
// Base UI: onValueChange(value, eventDetails) -> Radix: onValueChange(value)
interface TabsProps<T extends string = string> extends Omit<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>, 'onValueChange' | 'value' | 'defaultValue'> {
  onValueChange?: ((value: T) => void) | undefined
  value?: T | undefined
  defaultValue?: T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Tabs = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Root>, TabsProps<any>>(
  ({ onValueChange, ...props }, ref) => {
    // Create Base UI props, only including onValueChange if it's defined
    const baseUIProps = onValueChange
      ? { onValueChange: (value: string) => onValueChange(value) }
      : {}

    return (
      <TabsPrimitive.Root
        ref={ref}
        {...baseUIProps}
        {...props}
      />
    )
  }
)
Tabs.displayName = "Tabs"

// Use Omit to remove the style property from base type and redefine it for exactOptionalPropertyTypes
type TabsListProps = Omit<React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>, 'style'> & {
  style?: React.CSSProperties
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, style, ...props }, ref) => {
  // Conditionally include style to avoid passing undefined with exactOptionalPropertyTypes
  const styleProps = style !== undefined ? { style } : {}

  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        // Base layout - horizontal flex row (essential for tabs)
        "inline-flex w-full items-center gap-1",
        // Basic appearance - can be overridden by consumer
        "h-auto rounded-lg bg-muted p-1",
        className
      )}
      {...styleProps}
      {...props}
    />
  )
})
TabsList.displayName = "TabsList"

// Use Omit to remove disabled from base type and redefine for exactOptionalPropertyTypes
type TabsTriggerProps = Omit<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Tab>, 'disabled'> & {
  disabled?: boolean
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Tab>,
  TabsTriggerProps
>(({ className, disabled, ...props }, ref) => {
  // Conditionally include disabled to avoid passing undefined with exactOptionalPropertyTypes
  const disabledProps = disabled !== undefined ? { disabled } : {}

  return (
    <TabsPrimitive.Tab
      ref={ref}
      className={cn(
        // Layout
        "inline-flex flex-1 items-center justify-center gap-1.5",
        "min-h-[44px] px-4 py-2",
        "whitespace-nowrap rounded-md",
        // Typography
        "text-sm font-medium",
        // Default state (inactive)
        "text-muted-foreground bg-transparent",
        // Hover state
        "hover:text-foreground hover:bg-muted/50",
        // Selected state - Base UI uses aria-selected
        "aria-selected:bg-background aria-selected:text-primary aria-selected:shadow-sm",
        // Transitions
        "transition-all duration-200",
        // Focus state
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // Disabled state
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...disabledProps}
      {...props}
    />
  )
})
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Panel>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Panel>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Panel
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
export type { TabsProps, TabsListProps, TabsTriggerProps as TabsTabProps }
