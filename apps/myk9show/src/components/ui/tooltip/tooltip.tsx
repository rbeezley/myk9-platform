import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

// Base UI Tooltip doesn't need a Provider - context is managed per-tooltip
const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>

const Tooltip = TooltipPrimitive.Root

interface TooltipTriggerProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> {
  asChild?: boolean
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  TooltipTriggerProps
>(({ asChild, children, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return (
      <TooltipPrimitive.Trigger ref={ref} render={children} {...props} />
    )
  }
  return (
    <TooltipPrimitive.Trigger ref={ref} {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  )
})
TooltipTrigger.displayName = "TooltipTrigger"

interface TooltipContentProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Popup> {
  sideOffset?: number
  side?: "top" | "right" | "bottom" | "left"
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Popup>,
  TooltipContentProps
>(({ className, sideOffset = 4, side = "top", ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Positioner sideOffset={sideOffset} side={side}>
      <TooltipPrimitive.Popup
        ref={ref}
        className={
          "z-50 overflow-hidden rounded-md bg-black px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 data-[delayed-open]:fade-in-0" +
          (className ? ` ${className}` : "")
        }
        {...props}
      />
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
