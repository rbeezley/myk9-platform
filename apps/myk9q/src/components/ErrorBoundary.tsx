import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, WifiOff } from 'lucide-react';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    eventId: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true, 
      error,
      eventId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to console in development
    if (process.env.NODE_ENV === 'development') {
      logger.error('🚨 Error Boundary Caught Error:', error, errorInfo);
    }

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    });
  };

  private handleReloadPage = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  /**
   * Detect if error is a chunk/module load failure or network-related
   * Shows offline-friendly UI for better UX when the user has no connectivity
   */
  private isChunkLoadError = (): boolean => {
    const error = this.state.error;
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorName = error?.name?.toLowerCase() || '';
    const errorString = String(error).toLowerCase();

    // Check if browser reports offline
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    // Log for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      logger.log('[ErrorBoundary] Error details:', {
        message: error?.message,
        name: error?.name,
        isOffline,
        errorString: errorString.slice(0, 200)
      });
    }

    // Pattern matching for various offline/network error scenarios
    const isNetworkError = (
      // Chunk loading failures
      errorMessage.includes('failed to fetch dynamically imported module') ||
      errorMessage.includes('loading chunk') ||
      errorMessage.includes('loading css chunk') ||
      // General fetch failures (Supabase, dynamic imports)
      errorMessage.includes('failed to fetch') ||
      errorMessage.includes('fetch failed') ||
      errorMessage.includes('networkerror') ||
      errorMessage.includes('network error') ||
      errorMessage.includes('network request failed') ||
      // TypeError from failed fetch (common in some browsers)
      (errorName === 'typeerror' && errorMessage.includes('fetch')) ||
      // Supabase-specific errors
      errorMessage.includes('connection') ||
      errorMessage.includes('socket') ||
      // Check stringified error (catches wrapped errors)
      errorString.includes('failed to fetch') ||
      errorString.includes('networkerror')
    );

    // If browser is offline, show offline UI for any error
    // (user can't do much without connectivity anyway)
    return isNetworkError || isOffline;
  };

  private copyErrorDetails = () => {
    const errorDetails = {
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      eventId: this.state.eventId,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };

    navigator.clipboard?.writeText(JSON.stringify(errorDetails, null, 2))
      .then(() => {
        alert('Error details copied to clipboard');
      })
      .catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = JSON.stringify(errorDetails, null, 2);
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Error details copied to clipboard');
      });
  };

  public render() {
    if (this.state.hasError) {
      // Custom fallback UI provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isOfflineError = this.isChunkLoadError();

      // Offline/Chunk load error UI
      if (isOfflineError) {
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
              {/* Offline Icon */}
              <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                <WifiOff className="w-8 h-8 text-orange-600" />
              </div>

              {/* Title */}
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                Page Not Available Offline
              </h1>

              {/* Message */}
              <p className="text-gray-600 mb-6">
                This page needs an internet connection to load. Please check your connection and try again, or go back to the home page.
              </p>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={this.handleReloadPage}
                  className="w-full bg-orange-500 text-white py-2 px-4 rounded-md hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Go to Home
                </button>
              </div>

              {/* Tip */}
              <p className="mt-6 text-sm text-gray-500">
                💡 Tip: Visit pages while online to cache them for offline use.
              </p>
            </div>
          </div>
        );
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
            {/* Error Icon */}
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>

            {/* Error Title */}
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Something went wrong
            </h1>

            {/* Error Message */}
            <p className="text-gray-600 mb-6">
              {process.env.NODE_ENV === 'development' && this.state.error?.message
                ? `Error: ${this.state.error.message}`
                : "We're sorry, but something unexpected happened. Please try refreshing the page or contact support if the problem persists."
              }
            </p>

            {/* Error ID for support */}
            {this.state.eventId && (
              <div className="bg-gray-100 rounded p-3 mb-6 text-sm">
                <p className="text-gray-600 mb-1">Error ID:</p>
                <code className="text-xs font-mono text-gray-800 break-all">
                  {this.state.eventId}
                </code>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={this.handleRetry}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>

              <div className="flex gap-2">
                <button
                  onClick={this.handleGoHome}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Home
                </button>

                <button
                  onClick={this.handleReloadPage}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload
                </button>
              </div>

              {/* Copy Error Details (Development only) */}
              {process.env.NODE_ENV === 'development' && (
                <button
                  onClick={this.copyErrorDetails}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-2 py-2"
                >
                  <Bug className="w-4 h-4" />
                  Copy Error Details
                </button>
              )}
            </div>

            {/* Development Error Stack */}
            {process.env.NODE_ENV === 'development' && this.state.error?.stack && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Show Error Stack (Development)
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 p-3 rounded overflow-x-auto text-red-600 font-mono">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

// Hook for throwing errors that will be caught by error boundary
export const useErrorHandler = () => {
  return React.useCallback((error: Error | string, _errorInfo?: ErrorInfo) => {
    if (typeof error === 'string') {
      throw new Error(error);
    }
    throw error;
  }, []);
};