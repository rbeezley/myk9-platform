import React from 'react';
import { cn } from '../../lib/utils';

/**
 * EmptyState Component - Migrated to Tailwind CSS
 *
 * Reusable component for displaying empty states
 * Used when there are no items to display (e.g., no search results, no entries, etc.)
 */

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        'py-12 px-6',
        'text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-[var(--muted-foreground)] opacity-60 text-5xl">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
        {title}
      </h3>
      {message && (
        <p className="text-sm text-[var(--muted-foreground)] max-w-xs mb-4">
          {message}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
