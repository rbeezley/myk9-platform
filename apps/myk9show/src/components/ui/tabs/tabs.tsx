"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

// Wrapper to maintain Radix API compatibility
// Base UI: onValueChange(value, eventDetails) -> Radix: onValueChange(value)
interface TabsProps<T extends string = string> extends Omit<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>, 'onValueChange' | 'value' | 'defaultValue'> {
  onValueChange?: (value: T) => void
  value?: T
  defaultValue?: T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Tabs = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Root>, TabsProps<any>>(
  ({ onValueChange, ...props }, ref) => (
    <TabsPrimitive.Root
      ref={ref}
      onValueChange={onValueChange ? (value: string) => onValueChange(value) : undefined}
      {...props}
    />
  )
)
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 p-1 text-muted-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Tab>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Tab>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Tab
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-gradient-to-r data-[selected]:from-primary/10 data-[selected]:to-primary/5 data-[selected]:text-primary data-[selected]:shadow-sm data-[selected]:border data-[selected]:border-primary/20",
      className
    )}
    {...props}
  />
))
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
