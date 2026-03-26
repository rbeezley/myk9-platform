import * as React from 'react';
import { cn } from '@/lib/utils';

// Premium design constants from design tokens
const appleInput = {
  // Base styling with Preferred dimensions - solid design
  base: [
    'flex h-10 w-full', // 2.5rem height from design tokens
    'px-3.5 py-2.5', // Enhanced padding for touch targets
    'bg-input', // Solid input background - consistent with design system
    'border border-[var(--input-border)]', // Visible edge for discoverability
    'rounded-xl', // 12px radius from tokens
    'transition-all duration-200 ease-apple', // standard easing
    'transform-gpu', // GPU acceleration for smoother animations
  ],
  // Typography matching design system
  typography: [
    'text-sm font-medium', // 0.875rem with medium weight
    'tracking-tight', // Tight letter spacing
    'placeholder:text-muted-foreground/60',
    'placeholder:font-normal',
  ],
  // Focus states with Premium styling
  focus: [
    'focus-visible:outline-none',
    'focus-visible:ring-2',
    'focus-visible:ring-primary',
    'focus-visible:ring-offset-0',
    'focus-visible:border-primary/15',
    'focus-visible:bg-background',
    'focus-visible:shadow-sm',
    'focus-visible:scale-[1.02]',
  ],
  // Hover and interaction states
  interactive: [
    'hover:border-[var(--input-border-hover)]',
    'hover:bg-background',
    'hover:shadow-sm',
  ],
  // File input styling
  file: [
    'file:border-0',
    'file:bg-transparent',
    'file:text-sm',
    'file:font-medium',
    'file:text-foreground',
  ],
  // Disabled state
  disabled: ['disabled:cursor-not-allowed', 'disabled:opacity-50', 'disabled:bg-muted/30'],
};

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Premium input styling
          ...appleInput.base,
          ...appleInput.typography,
          ...appleInput.focus,
          ...appleInput.interactive,
          ...appleInput.file,
          ...appleInput.disabled,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
