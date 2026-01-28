"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const labelVariants = cva(
  // Apple-inspired label styling from design tokens
  [
    // Typography matching Apple's label standards
    'text-xs font-medium', // Smaller, less prominent labels
    'leading-tight', // Tighter leading for labels
    'tracking-wide uppercase', // Apple's preferred spacing with uppercase
    'text-muted-foreground/80', // Much more muted foreground

    // Interaction states
    'peer-disabled:cursor-not-allowed',
    'peer-disabled:opacity-50', // More pronounced disabled state
    'peer-disabled:text-muted-foreground',

    // Focus-within enhancement for better form UX
    'peer-focus-visible:text-foreground',
    'peer-focus-visible:font-semibold',

    // Smooth transitions
    'transition-colors duration-200 ease-apple',
  ].join(' ')
)

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = "Label"

export { Label }
