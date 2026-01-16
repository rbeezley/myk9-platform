import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorClassificationService } from '@/services/error/ErrorClassificationService';
import type { ErrorDetails } from '@/services/error/GlobalErrorHandler';
import { logger } from '@/services/LoggingService';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (props: { error: Error | null; resetErrorBoundary: () => void }) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'section' | 'component';
  context?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
  classifiedError?: import('@/services/error/ErrorClassificationService').ClassifiedError;
}

/**
 * Enhanced error boundary component with retry logic, error reporting, and context-specific handling.
 * Catches JavaScript errors in its child component tree, logs those errors, and displays appropriate fallback UI.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryCount = 0;
  private maxRetries = 3;
  private errorClassificationService = ErrorClassificationService.getInstance();

  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorId: '',
    classifiedError: undefined
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Classify the error for better handling
    const errorDetails: ErrorDetails = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: `session_${Date.now()}`,
      errorType: 'javascript',
      severity: 'high'
    };

    const classifiedError = this.errorClassificationService.classifyError(errorDetails);

    // Log the error to our monitoring service
    this.logErrorToService(error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
      classifiedError
    });

    // Call the optional onError callback
    this.props.onError?.(error, errorInfo);
  }

  private logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
    // In a real app, this would send to monitoring service (Sentry, LogRocket, etc.)
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      context: this.props.context || 'Unknown',
      level: this.props.level || 'component',
      timestamp: new Date().toISOString(),
      errorId: this.state.errorId,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    logger.error('Error Boundary Caught Error:', 'components', {}, new Error(errorReport.message));
    
    // Store in localStorage for debugging
    try {
      const existingErrors = JSON.parse(localStorage.getItem('errorBoundaryLogs') || '[]');
      existingErrors.push(errorReport);
      // Keep only the last 10 errors
      const recentErrors = existingErrors.slice(-10);
      localStorage.setItem('errorBoundaryLogs', JSON.stringify(recentErrors));
    } catch {
      // If localStorage fails, continue silently
    }
  };

  private handleRetry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: ''
      });
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private renderErrorDetails = () => {
    const { error, errorInfo } = this.state;
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (!isDevelopment) return null;

    return (
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
          Technical Details (Development Only)
        </summary>
        <div className="mt-2 p-3 bg-gray-50 rounded border text-xs">
          <div className="mb-2">
            <strong>Error:</strong> {error?.message}
          </div>
          <div className="mb-2">
            <strong>Stack:</strong>
            <pre className="mt-1 whitespace-pre-wrap">{error?.stack}</pre>
          </div>
          <div>
            <strong>Component Stack:</strong>
            <pre className="mt-1 whitespace-pre-wrap">{errorInfo?.componentStack}</pre>
          </div>
        </div>
      </details>
    );
  };

  public render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          resetErrorBoundary: () => this.setState({ hasError: false, error: null, errorInfo: null, errorId: '' })
        });
      }

      // Default fallback UI based on error level
      const { level = 'component', context = 'Application' } = this.props;
      const canRetry = this.retryCount < this.maxRetries;

      if (level === 'page') {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  Page Error
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-600">
                  We encountered an error while loading this page. This has been reported to our team.
                </p>
                
                <Alert>
                  <Bug className="h-4 w-4" />
                  <AlertDescription>
                    Error ID: <code className="text-xs">{this.state.errorId}</code>
                  </AlertDescription>
                </Alert>

                <div className="flex flex-col gap-2">
                  {canRetry && (
                    <Button onClick={this.handleRetry} className="w-full">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again ({this.maxRetries - this.retryCount} attempts left)
                    </Button>
                  )}
                  <Button variant="outline" onClick={this.handleReload} className="w-full">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reload Page
                  </Button>
                  <Button variant="outline" onClick={this.handleGoHome} className="w-full">
                    <Home className="h-4 w-4 mr-2" />
                    Go Home
                  </Button>
                </div>

                {this.renderErrorDetails()}
              </CardContent>
            </Card>
          </div>
        );
      }

      if (level === 'section') {
        return (
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600 text-base">
                <AlertTriangle className="h-4 w-4" />
                Section Unavailable
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-600">
                The {context.toLowerCase()} section encountered an error and couldn't load.
              </p>
              
              <div className="flex gap-2">
                {canRetry && (
                  <Button size="sm" variant="outline" onClick={this.handleRetry}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={this.handleReload}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>

              {this.renderErrorDetails()}
            </CardContent>
          </Card>
        );
      }

      // Component-level error (minimal UI)
      return (
        <div className="p-3 border border-red-200 bg-red-50 rounded">
          <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            Component Error
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Unable to render {context.toLowerCase()}
          </p>
          <div className="flex gap-2 mt-2">
            {canRetry && (
              <button
                onClick={this.handleRetry}
                className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-50"
              >
                Retry
              </button>
            )}
          </div>
          {this.renderErrorDetails()}
        </div>
      );
    }

    return this.props.children;
  }
}

// Specialized error boundaries for different contexts
export const RegistrationErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary 
    level="section" 
    context="Registration Wizard"
    onError={(error, errorInfo) => {
      // Specific logging for registration errors
      logger.error('Registration Wizard Error:', 'common', { data: { error, errorInfo } });
    }}
  >
    {children}
  </ErrorBoundary>
);

export const SearchErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary 
    level="component" 
    context="Search Interface"
    onError={(error, errorInfo) => {
      // Specific logging for search errors
      logger.error('Search Interface Error:', 'common', { data: { error, errorInfo } });
    }}
  >
    {children}
  </ErrorBoundary>
);

export const PaymentErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary 
    level="section" 
    context="Payment Processing"
    onError={(error, errorInfo) => {
      // Critical logging for payment errors
      logger.error('CRITICAL - Payment Error:', 'common', { data: { error, errorInfo } });
      // In production, would immediately alert monitoring
    }}
  >
    {children}
  </ErrorBoundary>
);

// Higher-order component for wrapping components with error boundaries
// eslint-disable-next-line react-refresh/only-export-components
export function withErrorBoundary<T extends Record<string, unknown>>(
  Component: React.ComponentType<T>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent: React.FC<T> = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default ErrorBoundary;
