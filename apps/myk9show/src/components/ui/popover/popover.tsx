import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

interface PopoverTriggerProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger> {
  asChild?: boolean
}

const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
  ({ asChild, children, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return <PopoverPrimitive.Trigger render={children} {...props} />
    }
    return (
      <PopoverPrimitive.Trigger ref={ref} {...props}>
        {children}
      </PopoverPrimitive.Trigger>
    )
  }
)
PopoverTrigger.displayName = "PopoverTrigger"

// Base UI Popover doesn't have Anchor - create a no-op for API compatibility
const PopoverAnchor = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} {...props} />
)
PopoverAnchor.displayName = "PopoverAnchor"

interface PopoverContentProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup> {
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Popup>,
  PopoverContentProps
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-[100]">
      <PopoverPrimitive.Popup
        ref={ref}
        className={cn(
          "z-[100] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
