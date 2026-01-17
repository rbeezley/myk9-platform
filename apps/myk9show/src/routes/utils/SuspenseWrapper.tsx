/**
 * SuspenseWrapper - Enhanced suspense wrapper with loading boundaries
 * 
 * Provides consistent loading states, error boundaries, and retry logic
 * for lazy-loaded components
 */

import React, { Suspense, useState, useEffect } from 'react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { trackLazyComponentStart, trackLazyComponentEnd, trackLazyComponentRetry } from '@/utils/lazyLoadingMetrics';
import { logger } from '@/services/LoggingService';

interface SuspenseWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: (error: Error, retry: () => void) => React.ReactNode;
  timeout?: number; // timeout in ms for loading
  componentName?: string; // for performance tracking
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

class LoadingErrorBoundary extends React.Component<
  { 
    children: React.ReactNode;
    errorFallback?: (error: Error, retry: () => void) => React.ReactNode;
    componentName?: string;
  },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; errorFallback?: (error: Error, retry: () => void) => React.ReactNode; componentName?: string }) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, retryCount: 0 };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('LoadingErrorBoundary caught an error:', 'utils', { data: error, errorInfo });
    
    // Track error in metrics
    if (this.props.componentName) {
      trackLazyComponentEnd(this.props.componentName, false, error.message);
    }
  }

  retry = () => {
    const { componentName } = this.props;
    if (componentName) {
      trackLazyComponentRetry(componentName);
    }
    
    this.setState(prevState => ({
      hasError: false,
      error: null,
      retryCount: prevState.retryCount + 1
    }));
  };

  override render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.errorFallback) {
        return this.props.errorFallback(this.state.error, this.retry);
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-destructive/10 rounded-full">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">Failed to load component</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error.message || 'An error occurred while loading this page.'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={this.retry} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                Reload Page
              </Button>
            </div>
            {this.state.retryCount > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Retry attempts: {this.state.retryCount}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const LoadingFallback: React.FC<{ timeout?: number }> = ({ timeout = 10000 }) => {
  const [showSlowWarning, setShowSlowWarning] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSlowWarning(true);
    }, timeout);

    return () => clearTimeout(timer);
  }, [timeout]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] p-6">
      <LoadingSpinner />
      <p className="text-sm text-muted-foreground mt-4">Loading...</p>
      {showSlowWarning && (
        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">
            This is taking longer than expected
          </p>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reload Page
          </Button>
        </div>
      )}
    </div>
  );
};

export const SuspenseWrapper: React.FC<SuspenseWrapperProps> = ({
  children,
  fallback,
  errorFallback,
  timeout = 10000,
  componentName
}) => {
  useEffect(() => {
    if (componentName) {
      trackLazyComponentStart(componentName);

      // Track successful load after a brief delay
      const timer = setTimeout(() => {
        trackLazyComponentEnd(componentName, true);
      }, 100);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [componentName]);

  return (
    <LoadingErrorBoundary 
      errorFallback={errorFallback} 
      componentName={componentName}
    >
      <Suspense fallback={fallback || <LoadingFallback timeout={timeout} />}>
        {children}
      </Suspense>
    </LoadingErrorBoundary>
  );
};

export default SuspenseWrapper;