/**
 * RefreshIndicator Component - Migrated to Tailwind CSS
 *
 * Shows a subtle indicator when data is being refreshed in the background
 * (part of stale-while-revalidate pattern)
 */

import React from 'react';
import { cn } from '../../lib/utils';

interface RefreshIndicatorProps {
  /** Whether to show the indicator */
  isRefreshing: boolean;
  /** Position on screen */
  position?: 'top' | 'bottom';
  /** Custom message */
  message?: string;
  /** Additional className */
  className?: string;
}

export const RefreshIndicator: React.FC<RefreshIndicatorProps> = ({
  isRefreshing,
  position = 'top',
  message = 'Refreshing...',
  className,
}) => {
  if (!isRefreshing) return null;

  return (
    <div
      className={cn(
        'fixed left-1/2 -translate-x-1/2 z-50',
        'px-4 py-2 rounded-full',
        'bg-[var(--card)] shadow-lg',
        'border border-[var(--border)]',
        'animate-fade-in',
        position === 'top' ? 'top-4' : 'bottom-4',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'w-4 h-4 rounded-full',
            'border-2 border-[var(--primary)] border-t-transparent',
            'animate-spin'
          )}
        />
        <span className="text-sm text-[var(--muted-foreground)]">
          {message}
        </span>
      </div>
    </div>
  );
};
