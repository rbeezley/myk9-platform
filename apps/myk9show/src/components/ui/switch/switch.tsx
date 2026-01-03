import * as React from "react"
import { Switch as SwitchPrimitives } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// Explicit interface to ensure TypeScript can infer callback parameter types
interface SwitchProps extends React.ComponentPropsWithoutRef<'span'> {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  required?: boolean
  name?: string
  onCheckedChange?: (checked: boolean) => void
}

// Using a typed forwardRef pattern for better inference
interface SwitchComponent extends React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLElement>> {
  displayName?: string
}

const Switch: SwitchComponent = React.forwardRef<HTMLElement, SwitchProps>(
  function Switch({ className, onCheckedChange, ...props }, ref) {
    // Wrap to adapt Base UI's (checked, eventDetails) to Radix's (checked)
    const handleCheckedChange = React.useCallback(
      (checked: boolean) => onCheckedChange?.(checked),
      [onCheckedChange]
    )

    return (
      <SwitchPrimitives.Root
        className={cn(
          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-input",
          className
        )}
        onCheckedChange={handleCheckedChange}
        {...props}
        ref={ref}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0"
          )}
        />
      </SwitchPrimitives.Root>
    )
  }
)

Switch.displayName = "Switch"

export { Switch }
export type { SwitchProps }