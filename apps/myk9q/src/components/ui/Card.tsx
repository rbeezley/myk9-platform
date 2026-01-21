import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Card Component - Migrated to Tailwind CSS
 */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'clickable' | 'scored' | 'unscored';
  onClick?: () => void;
}

// Base card styles
const baseStyles = [
  'bg-[var(--card)]',
  'rounded-[var(--token-radius-lg)]',
  'border border-[var(--border)]',
  'p-4',
  'shadow-[var(--token-shadow-sm)]',
  'transition-all duration-300',
].join(' ');

// Variant-specific styles
const variantStyles = {
  default: '',
  clickable: [
    'cursor-pointer',
    'hover:-translate-y-0.5 hover:shadow-[var(--token-shadow-lg)]',
    'active:scale-[0.98] active:transition-transform active:duration-100',
  ].join(' '),
  scored: [
    'border-[var(--status-checked-in)]',
    'bg-[rgba(52,199,89,0.05)]',
  ].join(' '),
  unscored: [
    'border-[var(--pending-orange)]',
    'shadow-[0_0_0_2px_var(--pending-orange),var(--pending-glow)]',
  ].join(' '),
} as const;

// Haptic feedback is handled globally by useGlobalHaptic hook
export const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
  onClick,
}) => {
  const isClickable = variant === 'clickable' || !!onClick;

  return (
    <div
      className={cn(
        baseStyles,
        variantStyles[variant],
        isClickable && variant !== 'clickable' && variantStyles.clickable,
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className }) => (
  <div className={cn('flex items-center justify-between mb-3', className)}>
    {children}
  </div>
);

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export const CardContent: React.FC<CardContentProps> = ({ children, className }) => (
  <div className={cn('', className)}>
    {children}
  </div>
);

interface CardActionsProps {
  children: React.ReactNode;
  className?: string;
}

export const CardActions: React.FC<CardActionsProps> = ({ children, className }) => (
  <div className={cn('flex items-center gap-2 mt-4 pt-4 border-t border-[var(--border)]', className)}>
    {children}
  </div>
);