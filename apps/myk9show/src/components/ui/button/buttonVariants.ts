import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  // Apple-inspired base button styling from design tokens
  [
    // Layout and spacing
    'inline-flex items-center justify-center gap-2.5',
    'whitespace-nowrap',
    'font-semibold', // 590 weight from design tokens
    'text-sm leading-tight',
    'tracking-tight', // Apple's preferred spacing
    
    // Apple-style border radius and shadows
    'rounded-xl', // 12px from design tokens
    'shadow-sm',
    
    // Enhanced focus states with Apple styling
    'focus-visible:outline-none',
    'focus-visible:ring-2',
    'focus-visible:ring-primary/30',
    'focus-visible:ring-offset-1',
    'focus-visible:shadow-md',
    
    // Apple's signature animations
    'transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
    
    // Hover micro-interactions
    'hover:shadow-md hover:scale-[1.02]',
    'active:scale-[0.98] active:shadow-sm',
    
    // Disabled states
    'disabled:pointer-events-none',
    'disabled:opacity-50',
    'disabled:scale-100',
    'disabled:shadow-none',
    
    // Icon handling
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          // Primary accent color button - follows user's selected accent color
          "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg dark:text-primary-foreground dark:shadow-xl",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          // Apple-style outline button with subtle styling
          "border border-border/40 bg-background/50 backdrop-blur-sm shadow-sm hover:bg-background hover:border-border/60 hover:shadow-md",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent/50 hover:backdrop-blur-sm hover:text-accent-foreground hover:shadow-sm",
        link: "text-primary underline-offset-4 hover:underline",
        premium: "bg-yellow-500 hover:bg-yellow-600 text-primary-foreground font-bold shadow-sm",
      },
      size: {
        // Apple-inspired sizing from design tokens
        default: "h-9 px-6 py-2.5", // Enhanced horizontal padding
        sm: "h-8 rounded-lg px-4 text-xs", // 8px radius for small
        lg: "h-11 rounded-xl px-8 text-base", // Larger size with proper scaling
        icon: "h-9 w-9 rounded-xl", // Consistent radius for icons
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);