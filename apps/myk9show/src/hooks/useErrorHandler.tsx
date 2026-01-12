import React from 'react';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { logger } from '@/services/LoggingService';

// Higher-order component for wrapping components with error boundaries
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    level?: 'page' | 'section' | 'component';
    context?: string;
    fallback?: (props: { error: Error | null; resetErrorBoundary: () => void }) => React.ReactNode;
  }
) {
  const WrappedComponent: React.FC<P> = (props) => (
    <ErrorBoundary {...options}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

// Hook for error reporting from functional components
export const useErrorHandler = () => {
  const reportError = React.useCallback((error: Error, context?: string) => {
    const errorReport = {
      message: error.message,
      stack: error.stack,
      context: context || 'Functional Component',
      timestamp: new Date().toISOString(),
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    logger.error('Manual Error Report:', 'hooks', {}, errorReport as Error);
    
    // Store in localStorage for debugging
    try {
      const existingErrors = JSON.parse(localStorage.getItem('manualErrorLogs') || '[]');
      existingErrors.push(errorReport);
      const recentErrors = existingErrors.slice(-10);
      localStorage.setItem('manualErrorLogs', JSON.stringify(recentErrors));
    } catch {
      // If localStorage fails, continue silently
    }
  }, []);

  return { reportError };
};