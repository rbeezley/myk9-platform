import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { Radio } from "@base-ui/react/radio"
import { Circle } from "lucide-react"

import { cn } from "@/lib/utils"

// Wrapper to maintain Radix API compatibility
// Use generic to allow typed callbacks like (value: MyEnum) => void
interface RadioGroupProps<T extends string = string> extends Omit<React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive>, 'onValueChange' | 'value' | 'defaultValue'> {
  onValueChange?: (value: T) => void
  value?: T
  defaultValue?: T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RadioGroup = React.forwardRef<React.ElementRef<typeof RadioGroupPrimitive>, RadioGroupProps<any>>(
  ({ className, onValueChange, ...props }, ref) => {
    return (
      <RadioGroupPrimitive
        className={cn("grid gap-2", className)}
        onValueChange={onValueChange ? (value) => onValueChange(value) : undefined}
        {...props}
        ref={ref}
      />
    )
  }
)
RadioGroup.displayName = "RadioGroup"

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof Radio.Root>,
  React.ComponentPropsWithoutRef<typeof Radio.Root>
>(({ className, ...props }, ref) => {
  return (
    <Radio.Root
      ref={ref}
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <Radio.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </Radio.Indicator>
    </Radio.Root>
  )
})
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }