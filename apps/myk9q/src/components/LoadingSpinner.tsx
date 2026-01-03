import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Loading...', 
  size = 'md',
  fullScreen = false
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  // Use classes from critical.css for fullScreen to ensure theme colors load before React
  const containerClasses = fullScreen
    ? 'page-loader-container min-h-screen flex items-center justify-center'
    : 'flex items-center justify-center p-8';

  return (
    <div className={containerClasses}>
      <div className="text-center">
        <Loader2
          className={`${sizeClasses[size]} animate-spin mx-auto mb-4 loader-spinner`}
        />
        {message && (
          <p className="text-sm loader-text">{message}</p>
        )}
      </div>
    </div>
  );
};

// Specialized loading components for different contexts
export const PageLoader: React.FC<{ message?: string }> = ({ 
  message = 'Loading page...' 
}) => (
  <LoadingSpinner message={message} size="lg" fullScreen />
);

export const ScoresheetLoader: React.FC = () => (
  <LoadingSpinner 
    message="Loading scoresheet..." 
    size="lg" 
    fullScreen 
  />
);

export const ComponentLoader: React.FC<{ message?: string }> = ({ 
  message = 'Loading...' 
}) => (
  <LoadingSpinner message={message} size="md" />
);