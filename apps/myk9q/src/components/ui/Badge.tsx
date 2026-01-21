import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Badge Component - Migrated to Tailwind CSS
 *
 * Uses tw-* component classes from tailwind-utilities.css
 * or inline Tailwind utilities for customization.
 */

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'gradient' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Variant styles using Tailwind utilities
const variantStyles = {
  default: 'bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]',
  success: 'bg-[rgba(52,199,89,0.1)] text-[var(--success-green)] border border-[rgba(52,199,89,0.2)]',
  warning: 'bg-[rgba(255,149,0,0.1)] text-[var(--warning-amber)] border border-[rgba(255,149,0,0.2)]',
  error: 'bg-[rgba(255,59,48,0.1)] text-[var(--error-red)] border border-[rgba(255,59,48,0.2)]',
  info: 'bg-[rgba(0,122,255,0.1)] text-[var(--brand-blue)] border border-[rgba(0,122,255,0.2)]',
  gradient: 'bg-gradient-to-br from-[var(--brand-blue)] to-[var(--brand-purple)] text-white shadow-[0_1px_3px_rgba(0,122,255,0.3)]',
  secondary: 'bg-[var(--secondary)] text-[var(--secondary-foreground)] border border-[var(--border)]',
  outline: 'bg-transparent text-[var(--foreground)] border border-[var(--border)]',
} as const;

// Size styles
const sizeStyles = {
  sm: 'px-2 py-0.5 text-[0.6875rem]',
  md: 'px-3 py-1 text-xs',
  lg: 'px-4 py-1.5 text-sm',
} as const;

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className,
}) => {
  return (
    <span
      className={cn(
        // Base badge styles
        'inline-flex items-center gap-1 rounded-full',
        'font-semibold uppercase tracking-wide',
        'font-sans',
        // Variant styles
        variantStyles[variant],
        // Size styles
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
};

interface ArmbandBadgeProps {
  number: string | number;
  className?: string;
}

export const ArmbandBadge: React.FC<ArmbandBadgeProps> = ({ number, className }) => {
  const numberStr = String(number);
  const isLong = numberStr.length >= 4;

  return (
    <div
      className={cn(
        // Base armband badge styles
        'flex items-center justify-center',
        'w-14 h-14 min-w-14 min-h-14',
        'rounded-2xl',
        'bg-[var(--primary)] text-[var(--primary-foreground)]',
        'font-bold',
        'border-2 border-white/20',
        'shadow-[0_2px_8px_rgba(0,0,0,0.15)]',
        // Size adjustments for long numbers
        isLong ? 'text-[0.9375rem]' : 'text-lg',
        className
      )}
    >
      {number}
    </div>
  );
};

interface StatusIndicatorProps {
  status: 'scored' | 'pending';
  text?: string;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  text,
  className,
}) => {
  const baseStyles = cn(
    'absolute top-4 right-4',
    'rounded-2xl',
    'px-4 py-2',
    'flex items-center gap-1.5',
    'text-sm font-semibold',
    'shadow-[0_2px_8px_rgba(0,0,0,0.15)]',
    className
  );

  if (status === 'scored') {
    return (
      <div className={cn(baseStyles, 'bg-[var(--success-contrast,var(--status-checked-in))] text-white')}>
        <span className="text-sm">✓</span>
        <span>{text || 'SCORED'}</span>
      </div>
    );
  }

  return (
    <div className={cn(baseStyles, 'bg-[var(--warning-contrast,#c2410c)] text-white')}>
      <span>{text || 'PENDING'}</span>
    </div>
  );
};