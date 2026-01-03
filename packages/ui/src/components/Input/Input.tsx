import * as React from 'react';

import { cn } from '../../utils/cn';

// Apple-inspired design constants
const inputStyles = {
  // Base styling with Apple's preferred dimensions
  base: [
    'flex h-10 w-full',
    'px-3.5 py-2.5',
    'bg-input',
    'border-0',
    'rounded-xl',
    'transition-all duration-200 ease-apple',
    'transform-gpu',
  ],
  // Typography
  typography: [
    'text-sm font-medium',
    'tracking-tight',
    'placeholder:text-muted-foreground/60',
    'placeholder:font-normal',
  ],
  // Focus states
  focus: [
    'focus-visible:outline-none',
    'focus-visible:ring-2',
    'focus-visible:ring-primary/20',
    'focus-visible:ring-offset-0',
    'focus-visible:bg-background',
    'focus-visible:shadow-sm',
    'focus-visible:scale-[1.02]',
  ],
  // Hover states
  interactive: ['hover:bg-background', 'hover:shadow-sm'],
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

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input component with Apple-inspired styling.
 *
 * @example
 * // Basic input
 * <Input placeholder="Enter name..." />
 *
 * @example
 * // With type
 * <Input type="email" placeholder="Email address" />
 *
 * @example
 * // Disabled
 * <Input disabled placeholder="Disabled input" />
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          ...inputStyles.base,
          ...inputStyles.typography,
          ...inputStyles.focus,
          ...inputStyles.interactive,
          ...inputStyles.file,
          ...inputStyles.disabled,
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
