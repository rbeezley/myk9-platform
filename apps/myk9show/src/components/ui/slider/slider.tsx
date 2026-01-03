import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps {
  id?: string
  min: number
  max: number
  step: number
  value: number[]
  onValueChange: (value: number[]) => void
  className?: string
  disabled?: boolean
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ id, min, max, step, value, onValueChange, className, disabled, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value)
      onValueChange([newValue])
    }

    return (
      <div className={cn("relative w-full", className)}>
        <input
          ref={ref}
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[0] || 0}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "slider-thumb:appearance-none slider-thumb:h-4 slider-thumb:w-4",
            "slider-thumb:rounded-full slider-thumb:bg-primary",
            "slider-thumb:cursor-pointer slider-thumb:border-2 slider-thumb:border-background",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          )}
          {...props}
        />
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }