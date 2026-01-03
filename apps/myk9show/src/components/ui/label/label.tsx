"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
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
    'transition-colors duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
  ].join(' ')
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
