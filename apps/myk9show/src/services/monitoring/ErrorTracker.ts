// Error Tracking Service
// Phase 0: Performance Infrastructure
import { queryClient } from '@/lib/queryClient';
import { logger } from '@/services/LoggingService';

export interface DatabaseError {
  code: string;
  message: string;
  table?: string;
  operation?: string;
  timestamp: number;
  queryKey?: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByTable: Record<string, number>;
  recentErrors: DatabaseError[];
  errorRate: number;
  lastError: DatabaseError | null;
}

class ErrorTracker {
  private errors: DatabaseError[] = [];
  private readonly maxErrors = 500; // Keep last 500 errors

  constructor() {
    this.setupQueryErrorSubscription();
    this.setupGlobalErrorHandling();
  }

  private setupQueryErrorSubscription() {
    // Subscribe to React Query errors
    queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.error) {
        const error = event.query.state.error;
        this.trackError({
          code: 'QUERY_ERROR',
          message: error instanceof Error ? error.message : String(error),
          queryKey: event.query.queryKey.join('/'),
          timestamp: Date.now(),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    });

    // Subscribe to mutation errors
    queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.mutation.state.error) {
        const error = event.mutation.state.error;
        this.trackError({
          code: 'MUTATION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          operation: 'mutation',
          timestamp: Date.now(),
          stack: error instanceof Error ? error.stack : undefined,
          context: {
            variables: event.mutation.state.variables,
          },
        });
      }
    });
  }

  private setupGlobalErrorHandling() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError({
        code: 'UNHANDLED_REJECTION',
        message: String(event.reason),
        timestamp: Date.now(),
        stack: event.reason instanceof Error ? event.reason.stack : undefined,
      });
    });

    // Handle JavaScript errors
    window.addEventListener('error', (event) => {
      this.trackError({
        code: 'JAVASCRIPT_ERROR',
        message: event.message,
        timestamp: Date.now(),
        stack: event.error?.stack,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });
  }

  public trackError(error: Partial<DatabaseError>) {
    const fullError: DatabaseError = {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'Unknown error occurred',
      timestamp: error.timestamp || Date.now(),
      table: error.table,
      operation: error.operation,
      queryKey: error.queryKey,
      stack: error.stack,
      context: error.context,
    };

    this.errors.push(fullError);

    // Keep only the last N errors to prevent memory bloat
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    // Log errors in development
    if (process.env.NODE_ENV === 'development') {
      logger.error('Error tracked', 'error-tracking', fullError);
    }

    // Check for critical error patterns
    this.checkCriticalPatterns(fullError);
  }

  private checkCriticalPatterns(error: DatabaseError) {
    const recentErrors = this.getRecentErrors(5 * 60 * 1000); // Last 5 minutes

    // Check for error spikes
    if (recentErrors.length > 10) {
      logger.warn('Error spike detected: 10+ errors in 5 minutes', 'error-tracking', { errorCount: recentErrors.length });
    }

    // Check for repeated errors
    const sameErrors = recentErrors.filter(e =>
      e.code === error.code && e.message === error.message
    );
    if (sameErrors.length > 3) {
      logger.warn('Repeated error detected', 'error-tracking', { code: error.code, count: sameErrors.length });
    }

    // Check for database connection issues
    if (error.message.includes('connection') || error.message.includes('network')) {
      logger.error('Database connection issue detected', 'error-tracking', { message: error.message });
    }

    // Check for authentication issues
    if (error.code === 'PGRST301' || error.message.includes('unauthorized')) {
      logger.error('Authentication error detected', 'error-tracking', { message: error.message });
    }
  }

  public getStats(): ErrorStats {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const recentErrors = this.errors.filter(e => e.timestamp > oneHourAgo);

    const errorsByType = this.errors.reduce((acc, error) => {
      acc[error.code] = (acc[error.code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const errorsByTable = this.errors.reduce((acc, error) => {
      if (error.table) {
        acc[error.table] = (acc[error.table] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Calculate error rate (errors per hour)
    const errorRate = recentErrors.length;

    return {
      totalErrors: this.errors.length,
      errorsByType,
      errorsByTable,
      recentErrors: recentErrors.slice(-10), // Last 10 errors
      errorRate,
      lastError: this.errors[this.errors.length - 1] || null,
    };
  }

  public getRecentErrors(timeWindowMs: number): DatabaseError[] {
    const cutoff = Date.now() - timeWindowMs;
    return this.errors.filter(error => error.timestamp > cutoff);
  }

  public getErrorsByType(errorCode: string): DatabaseError[] {
    return this.errors.filter(error => error.code === errorCode);
  }

  public getErrorsByTable(tableName: string): DatabaseError[] {
    return this.errors.filter(error => error.table === tableName);
  }

  public clearErrors() {
    this.errors = [];
  }

  public exportErrors() {
    return {
      errors: this.errors,
      stats: this.getStats(),
      timestamp: Date.now(),
    };
  }

  // Enhanced logging for development
  public logErrorSummary() {
    if (process.env.NODE_ENV !== 'development') return;

    const stats = this.getStats();

    logger.info('Error Tracking Summary', 'error-tracking', {
      totalErrors: stats.totalErrors,
      errorRate: stats.errorRate,
      errorsByType: stats.errorsByType,
      errorsByTable: stats.errorsByTable,
      recentErrors: stats.recentErrors.slice(-3).map(e => ({ code: e.code, message: e.message })),
    });
  }

  // Database-specific error helpers
  public trackDatabaseError(
    error: Error, 
    table: string, 
    operation: string, 
    context?: Record<string, unknown>
  ) {
    // Parse Supabase/PostgreSQL error codes
    let code = 'DATABASE_ERROR';
    if (error.message.includes('duplicate key')) {
      code = 'DUPLICATE_KEY';
    } else if (error.message.includes('foreign key')) {
      code = 'FOREIGN_KEY_VIOLATION';
    } else if (error.message.includes('not found')) {
      code = 'NOT_FOUND';
    } else if (error.message.includes('unauthorized')) {
      code = 'UNAUTHORIZED';
    } else if (error.message.includes('connection')) {
      code = 'CONNECTION_ERROR';
    }

    this.trackError({
      code,
      message: error.message,
      table,
      operation,
      timestamp: Date.now(),
      stack: error.stack,
      context,
    });
  }

  // Health check for error monitoring
  public getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    details: string[];
  } {
    const stats = this.getStats();
    const details: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check error rate
    if (stats.errorRate > 20) {
      status = 'critical';
      details.push(`Critical error rate: ${stats.errorRate} errors/hour`);
    } else if (stats.errorRate > 10) {
      status = 'warning';
      details.push(`High error rate: ${stats.errorRate} errors/hour`);
    }

    // Check for connection errors
    const connectionErrors = this.getErrorsByType('CONNECTION_ERROR');
    if (connectionErrors.length > 3) {
      status = 'critical';
      details.push(`Database connection issues: ${connectionErrors.length} errors`);
    }

    // Check for auth errors
    const authErrors = this.getErrorsByType('UNAUTHORIZED');
    if (authErrors.length > 5) {
      status = 'warning';
      details.push(`Authentication issues: ${authErrors.length} errors`);
    }

    return { status, details };
  }
}

// Singleton instance
export const errorTracker = new ErrorTracker();

// Auto-log error summary every 10 minutes in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    errorTracker.logErrorSummary();
  }, 10 * 60 * 1000);
}

export default errorTracker;