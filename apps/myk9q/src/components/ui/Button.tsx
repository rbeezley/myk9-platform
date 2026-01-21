import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Button Component - Migrated to Tailwind CSS
 */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'gradient' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  fullWidth?: boolean;
}

// Base button styles
const baseStyles = [
  'inline-flex items-center justify-center',
  'border-none rounded-[0.75rem]',
  'font-semibold cursor-pointer',
  'transition-all duration-300',
  'relative overflow-hidden',
  'select-none',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  'active:scale-[0.98] active:transition-transform active:duration-100',
].join(' ');

// Variant styles
const variantStyles = {
  primary: [
    'bg-[var(--brand-gradient)] bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-purple)]',
    'text-white',
    'shadow-[0_2px_8px_rgba(0,122,255,0.3)]',
    'hover:enabled:-translate-y-px hover:enabled:scale-[1.02]',
    'hover:enabled:shadow-[0_4px_12px_rgba(0,122,255,0.4)]',
  ].join(' '),
  secondary: [
    'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
    'border border-[var(--border)]',
    'hover:enabled:bg-[var(--muted)]',
    'hover:enabled:-translate-y-px',
    'hover:enabled:shadow-[0_4px_12px_rgba(0,0,0,0.08)]',
  ].join(' '),
  outline: [
    'bg-transparent text-[var(--foreground)]',
    'border border-[var(--border)]',
    'hover:enabled:bg-[var(--muted)]',
  ].join(' '),
  gradient: [
    'bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-purple)]',
    'text-white',
    'shadow-[0_2px_8px_rgba(0,122,255,0.3)]',
    'hover:enabled:-translate-y-px hover:enabled:scale-[1.02]',
    'hover:enabled:shadow-[0_4px_12px_rgba(0,122,255,0.4)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--muted-foreground)]',
    'hover:enabled:bg-[var(--muted)]',
    'hover:enabled:text-[var(--foreground)]',
  ].join(' '),
} as const;

// Size styles
const sizeStyles = {
  sm: 'px-3 py-2 text-[0.8125rem] min-h-[36px]',
  md: 'px-4 py-3 text-[0.875rem] min-h-[52px]',
  lg: 'px-6 py-4 text-base min-h-[56px]',
  icon: 'p-3 min-h-[44px] min-w-[44px]',
} as const;

// Haptic feedback is handled globally by useGlobalHaptic hook
export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  ...props
}) => {
  return (
    <button
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};