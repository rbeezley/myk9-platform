import { DatabaseError } from '../database/supabaseClient';
import { logger } from '@/services/LoggingService';

interface ErrorContext {
  user?: {
    id: string;
    email?: string | undefined;
  } | undefined;
  operation?: string | undefined;
  table?: string | undefined;
  environment?: string | undefined;
  version?: string | undefined;
  [key: string]: unknown;
}

interface ErrorReport {
  message: string;
  stack?: string | undefined;
  level: 'error' | 'warning' | 'info';
  timestamp: string;
  context: ErrorContext;
  fingerprint?: string | undefined;
}

class ErrorTracker {
  private isInitialized = false;
  private errorQueue: ErrorReport[] = [];
  private maxQueueSize = 100;

  // Initialize error tracking service
  async initialize() {
    if (this.isInitialized) return;

    // Check if we should enable error tracking
    const shouldTrack = 
      import.meta.env.VITE_ERROR_TRACKING_ENABLED === 'true' &&
      import.meta.env.VITE_SENTRY_DSN;

    if (!shouldTrack) {
      logger.info('Error tracking disabled');
      return;
    }

    try {
      // Dynamically import Sentry to reduce bundle size if not used
      // @ts-expect-error - Sentry is optional dependency
      const Sentry = await import('@sentry/react').catch(() => null);
      
      if (!Sentry) {
        logger.warn('Sentry not installed. Install @sentry/react for error tracking.', 'services', {});
        return;
      }
      
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        integrations: [
          new Sentry.BrowserTracing(),
          new Sentry.Replay({
            maskAllText: true,
            maskAllInputs: true,
          }),
        ],
        tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
        beforeSend: (event: {exception?: {values?: Array<{type?: string}>}}) => {
          // Filter out certain errors
          if (event.exception?.values?.[0]?.type === 'NetworkError') {
            return null;
          }
          return event;
        },
      });

      this.isInitialized = true;
      console.info('📊 Error tracking initialized');

      // Process queued errors
      this.processErrorQueue();
    } catch (error) {
      logger.error('Failed to initialize error tracking:', 'services', {}, error as Error);
    }
  }

  // Track a database error
  trackDatabaseError(error: DatabaseError, context?: ErrorContext) {
    this.trackError({
      message: error.message,
      level: 'error',
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        table: error.table,
        operation: error.operation,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      fingerprint: this.generateFingerprint(error),
    });
  }

  // Track a general error
  trackError(errorOrReport: Error | ErrorReport, context?: ErrorContext) {
    const report: ErrorReport = 
      errorOrReport instanceof Error
        ? {
            message: errorOrReport.message,
            stack: errorOrReport.stack,
            level: 'error',
            timestamp: new Date().toISOString(),
            context: context || {},
          }
        : errorOrReport;

    if (!this.isInitialized) {
      // Queue errors if not initialized
      this.errorQueue.push(report);
      if (this.errorQueue.length > this.maxQueueSize) {
        this.errorQueue.shift();
      }
      return;
    }

    this.sendToErrorService(report);
  }

  // Track a warning
  trackWarning(message: string, context?: ErrorContext) {
    this.trackError({
      message,
      level: 'warning',
      timestamp: new Date().toISOString(),
      context: context || {},
    });
  }

  // Track an info message
  trackInfo(message: string, context?: ErrorContext) {
    this.trackError({
      message,
      level: 'info',
      timestamp: new Date().toISOString(),
      context: context || {},
    });
  }

  // Set user context
  setUserContext(user: { id: string; email?: string } | null) {
    if (!this.isInitialized) return;

    // @ts-expect-error - Sentry is optional
    import('@sentry/react').then(Sentry => {
      if (!Sentry) return;
      if (user) {
        Sentry.setUser({
          id: user.id,
          email: user.email,
        });
      } else {
        Sentry.setUser(null);
      }
    });
  }

  // Add breadcrumb for debugging
  addBreadcrumb(
    message: string,
    category: string,
    data?: Record<string, unknown>
  ) {
    if (!this.isInitialized) return;

    // @ts-expect-error - Sentry is optional
    import('@sentry/react').then(Sentry => {
      if (!Sentry) return;
      Sentry.addBreadcrumb({
        message,
        category,
        level: 'info',
        data,
        timestamp: Date.now() / 1000,
      });
    });
  }

  // Capture performance metric
  capturePerformanceMetric(
    name: string,
    value: number,
    unit: string = 'millisecond',
    tags?: Record<string, string>
  ) {
    if (!this.isInitialized) return;

    this.addBreadcrumb(
      `Performance: ${name}`,
      'performance',
      {
        value,
        unit,
        ...tags,
      }
    );

    // Log slow performance
    if (unit === 'millisecond' && value > 1000) {
      this.trackWarning(`Slow performance detected: ${name} took ${value}ms`, {
        metric: name,
        value,
        unit,
        ...tags,
      });
    }
  }

  // Private methods
  private async sendToErrorService(report: ErrorReport) {
    try {
      // @ts-expect-error - Sentry is optional
      const Sentry = await import('@sentry/react').catch(() => null);
      
      if (!Sentry) return;
      
      if (report.level === 'error') {
        Sentry.captureException(new Error(report.message), {
          level: 'error',
          contexts: {
            custom: report.context,
          },
          fingerprint: report.fingerprint ? [report.fingerprint] : undefined,
        });
      } else {
        Sentry.captureMessage(report.message, report.level);
      }
    } catch (error) {
      logger.error('Failed to send error to tracking service:', 'services', {}, error as Error);
    }
  }

  private processErrorQueue() {
    if (this.errorQueue.length === 0) return;

    console.info(`Processing ${this.errorQueue.length} queued errors`);
    
    this.errorQueue.forEach(report => {
      this.sendToErrorService(report);
    });

    this.errorQueue = [];
  }

  private generateFingerprint(error: DatabaseError): string {
    // Create a fingerprint based on error characteristics
    const parts = [
      error.code || 'unknown',
      error.table || 'unknown',
      error.operation || 'unknown',
      error.message.split(' ').slice(0, 3).join(' '), // First 3 words
    ];
    
    return parts.join(':');
  }
}

// Create singleton instance
export const errorTracker = new ErrorTracker();

// React error boundary integration
// This would be implemented as a React error boundary component
// that catches and reports errors to the tracking service
export const createErrorBoundary = () => {
  // Implementation would go here
  // Returns a React component that wraps children
};

// Hook for error tracking in components
export const useErrorHandler = () => {
  return {
    trackError: (error: Error, context?: ErrorContext) => 
      errorTracker.trackError(error, context),
    trackDatabaseError: (error: DatabaseError, context?: ErrorContext) =>
      errorTracker.trackDatabaseError(error, context),
    trackWarning: (message: string, context?: ErrorContext) =>
      errorTracker.trackWarning(message, context),
  };
};

// Axios/Fetch interceptor for API errors
export const setupAPIErrorInterceptor = () => {
  // This would intercept all API errors and track them
  // Example for fetch:
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      const response = await originalFetch(...args);
      
      if (!response.ok) {
        errorTracker.trackError({
          message: `API Error: ${response.status} ${response.statusText}`,
          level: 'error',
          timestamp: new Date().toISOString(),
          context: {
            url: args[0]?.toString(),
            status: response.status,
            statusText: response.statusText,
          },
        });
      }
      
      return response;
    } catch (error) {
      errorTracker.trackError(error as Error, {
        url: args[0]?.toString(),
        type: 'network',
      });
      throw error;
    }
  };
};

// Initialize on app startup
export const initializeMonitoring = async () => {
  await errorTracker.initialize();
  
  // Set up global error handler
  window.addEventListener('unhandledrejection', (event) => {
    errorTracker.trackError(
      new Error(event.reason?.message || 'Unhandled promise rejection'),
      {
        type: 'unhandledRejection',
        reason: event.reason,
      }
    );
  });

  // Set up global error handler
  window.addEventListener('error', (event) => {
    errorTracker.trackError(event.error || new Error(event.message), {
      type: 'globalError',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  // Set up API error interceptor
  setupAPIErrorInterceptor();
};