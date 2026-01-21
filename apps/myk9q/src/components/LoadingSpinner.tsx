import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * LoadingSpinner Component - Migrated to Tailwind CSS
 */

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
} as const;

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  size = 'md',
  fullScreen = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        fullScreen ? 'min-h-screen bg-[var(--background)]' : 'p-8',
        className
      )}
    >
      <div className="text-center">
        <Loader2
          className={cn(
            sizeClasses[size],
            'animate-spin mx-auto mb-4',
            'text-[var(--primary)]'
          )}
        />
        {message && (
          <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
        )}
      </div>
    </div>
  );
};

// Specialized loading components for different contexts
export const PageLoader: React.FC<{ message?: string }> = ({
  message = 'Loading page...',
}) => <LoadingSpinner message={message} size="lg" fullScreen />;

export const ScoresheetLoader: React.FC = () => (
  <LoadingSpinner message="Loading scoresheet..." size="lg" fullScreen />
);

export const ComponentLoader: React.FC<{ message?: string }> = ({
  message = 'Loading...',
}) => <LoadingSpinner message={message} size="md" />;