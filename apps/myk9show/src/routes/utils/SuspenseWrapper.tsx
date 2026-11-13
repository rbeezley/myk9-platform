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
import {
  trackLazyComponentStart,
  trackLazyComponentEnd,
  trackLazyComponentRetry,
} from '@/utils/lazyLoadingMetrics';
import { RESTART_THE_APP_LABEL } from '@/lib/offlineCopy';
import { logger } from '@/services/LoggingService';
import { resetFailedLazyRoutes } from '@/utils/lazyWithRetry';

const PAGE_LOAD_FAILED_BODY = 'Try again. If it still will not open, restart the app.';

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
  constructor(props: {
    children: React.ReactNode;
    errorFallback?: (error: Error, retry: () => void) => React.ReactNode;
    componentName?: string;
  }) {
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

    // React.lazy caches a rejected import; swap failed lazies for fresh ones so this re-mount re-imports.
    resetFailedLazyRoutes();

    this.setState(prevState => ({
      hasError: false,
      error: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  override render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.errorFallback) {
        return this.props.errorFallback(this.state.error, this.retry);
      }

      return (
        <div
          className="flex flex-col items-center justify-center min-h-[200px] p-6 pt-24"
          // MYK9-1114: the logger never reaches the console and production builds drop console
          // calls, so a lazy route that failed to load left no trace. Name the error here, out of
          // sight, for E2E diagnostics and support sessions.
          data-boundary-error={`${this.props.componentName ?? 'lazy route'}: ${this.state.error.name}: ${this.state.error.message}`}
        >
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-destructive/10 rounded-full">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">We couldn't open this page</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {import.meta.env.DEV
                ? this.state.error.message || PAGE_LOAD_FAILED_BODY
                : PAGE_LOAD_FAILED_BODY}
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={this.retry} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                {RESTART_THE_APP_LABEL}
              </Button>
            </div>
            {this.state.retryCount > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                You have tried again {this.state.retryCount}{' '}
                {this.state.retryCount === 1 ? 'time' : 'times'}.
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
          <p className="text-xs text-muted-foreground mb-2">This is taking longer than expected</p>
          <Button onClick={() => window.location.reload()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {RESTART_THE_APP_LABEL}
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
  componentName,
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
    return;
  }, [componentName]);

  return (
    <LoadingErrorBoundary
      {...(errorFallback !== undefined && { errorFallback })}
      {...(componentName !== undefined && { componentName })}
    >
      <Suspense fallback={fallback || <LoadingFallback timeout={timeout} />}>{children}</Suspense>
    </LoadingErrorBoundary>
  );
};

export default SuspenseWrapper;
