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
        // myK9Q-style tab bar: bottom border indicator design
        "flex w-full bg-[var(--muted)] border-b border-[var(--border)] rounded-t-xl overflow-hidden",
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
        // myK9Q-style tab trigger: bottom border indicator, primary color when active
        "flex-1 flex items-center justify-center gap-1.5",
        "min-h-[44px] px-4 py-3",
        "text-sm font-medium text-[var(--muted-foreground)]",
        "border-b-2 border-transparent",
        "transition-all duration-200",
        "hover:text-[var(--foreground)] hover:bg-[var(--muted)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        // Active state: primary text and bottom border (Base UI uses aria-selected, not data-selected)
        "aria-selected:bg-[var(--card)] aria-selected:text-[var(--primary)] aria-selected:border-b-[var(--primary)]",
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
