import * as React from "react"
import { DialogContent as OriginalDialogContent, DialogHeader as OriginalDialogHeader, DialogTitle as OriginalDialogTitle } from "./dialog"
import { cn } from "@/lib/utils"

// Enhanced DialogContent with proper light/dark mode backgrounds by default
const EnhancedDialogContent = React.forwardRef<
  React.ElementRef<typeof OriginalDialogContent>,
  React.ComponentPropsWithoutRef<typeof OriginalDialogContent>
>(({ className, children, ...props }, ref) => (
  <OriginalDialogContent
    ref={ref}
    className={cn(
      // Default light/dark mode backgrounds and borders
      "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700",
      // Ensure text is visible
      "text-gray-900 dark:text-gray-100",
      className
    )}
    {...props}
  >
    {children}
  </OriginalDialogContent>
))
EnhancedDialogContent.displayName = "EnhancedDialogContent"

// Enhanced DialogHeader with proper styling
const EnhancedDialogHeader: React.FC<React.ComponentPropsWithoutRef<typeof OriginalDialogHeader>> = ({ 
  className, 
  ...props 
}) => (
  <OriginalDialogHeader
    className={cn(
      // Ensure header content is visible
      "text-gray-900 dark:text-gray-100",
      className
    )}
    {...props}
  />
)
EnhancedDialogHeader.displayName = "EnhancedDialogHeader"

// Enhanced DialogTitle with proper text colors
const EnhancedDialogTitle = React.forwardRef<
  React.ElementRef<typeof OriginalDialogTitle>,
  React.ComponentPropsWithoutRef<typeof OriginalDialogTitle>
>(({ className, ...props }, ref) => (
  <OriginalDialogTitle
    ref={ref}
    className={cn(
      // Ensure title is always visible
      "text-gray-900 dark:text-gray-100",
      className
    )}
    {...props}
  />
))
EnhancedDialogTitle.displayName = "EnhancedDialogTitle"

export { EnhancedDialogContent, EnhancedDialogHeader, EnhancedDialogTitle }