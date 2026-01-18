import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

// Wrapper to maintain Radix API compatibility
// Base UI: onCheckedChange(checked, eventDetails) -> Radix: onCheckedChange(checked)
interface CheckboxProps extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'onCheckedChange' | 'checked'> {
  checked?: boolean | undefined
  onChange?: ((checked: boolean) => void) | undefined
  onCheckedChange?: ((checked: boolean) => void) | undefined
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, onChange, onCheckedChange, ...props }, ref) => {
  const handleCheckedChange = React.useCallback((checked: boolean) => {
    onCheckedChange?.(checked)
    onChange?.(checked)
  }, [onChange, onCheckedChange])

  // Filter out undefined optional properties for exactOptionalPropertyTypes
  const filteredProps = Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== undefined)
  )

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[checked]:text-primary-foreground",
        className
      )}
      onCheckedChange={handleCheckedChange}
      {...filteredProps}
    >
      <CheckboxPrimitive.Indicator
        className={cn("flex items-center justify-center text-current")}
      >
        <Check className="h-4 w-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }
