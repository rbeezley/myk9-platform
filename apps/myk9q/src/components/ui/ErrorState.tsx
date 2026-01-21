import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * ErrorState Component - Migrated to Tailwind CSS
 */

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'Unable to load data',
  onRetry,
  isRetrying = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        'min-h-[300px] p-6',
        className
      )}
    >
      <div className="flex flex-col items-center text-center max-w-sm">
        <AlertCircle
          className="w-12 h-12 text-[var(--error-red)] mb-4 flex-shrink-0"
        />
        <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">
          Oops!
        </h3>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          {message}
        </p>
        {onRetry && (
          <button
            className={cn(
              'inline-flex items-center justify-center gap-2',
              'px-6 py-3 rounded-xl',
              'bg-[var(--error-red)] text-white',
              'font-semibold text-sm',
              'min-h-[44px]',
              'transition-all duration-300',
              'hover:enabled:opacity-90 hover:enabled:-translate-y-px',
              'active:scale-[0.98]',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            onClick={onRetry}
            disabled={isRetrying}
          >
            <RefreshCw
              className={cn(
                'w-5 h-5 flex-shrink-0',
                isRetrying && 'animate-spin'
              )}
            />
            {isRetrying ? 'Retrying...' : 'Try Again'}
          </button>
        )}
      </div>
    </div>
  );
};
