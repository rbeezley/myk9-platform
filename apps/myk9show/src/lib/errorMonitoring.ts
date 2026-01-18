// Automated error reporting and monitoring system
// Phase 3.3: Enhanced Error Handling & Recovery

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';

// Error severity levels
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Error categories
export type ErrorCategory = 
  | 'network' 
  | 'validation' 
  | 'database' 
  | 'authentication' 
  | 'authorization' 
  | 'ui' 
  | 'performance' 
  | 'unknown';

// Error context interface
export interface ErrorContext {
  userId?: string;
  userRole?: string;
  sessionId: string;
  userAgent: string;
  url: string;
  timestamp: number;
  buildVersion?: string;
  networkStatus?: 'online' | 'offline';
  operationType?: 'create' | 'read' | 'update' | 'delete';
  entityType?: string;
  queryKey?: unknown[];
  additionalData?: Record<string, unknown>;
}

// Structured error interface
export interface StructuredError {
  id: string;
  message: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  stack?: string;
  context: ErrorContext;
  retryable: boolean;
  userImpact: 'none' | 'minor' | 'major' | 'blocking';
  resolution?: {
    suggested: string;
    automated?: boolean;
    steps?: string[];
  };
}

// Error metrics interface
export interface ErrorMetrics {
  totalErrors: number;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByCategory: Record<ErrorCategory, number>;
  recentErrorRate: number; // errors per minute in last 5 minutes
  criticalErrorsLast24h: number;
  networkErrorsLast24h: number;
  userImpactScore: number; // 0-100 scale
  topErrorMessages: Array<{ message: string; count: number }>;
  errorTrends: {
    increasing: string[];
    decreasing: string[];
  };
}

// Error monitoring configuration
const MONITORING_CONFIG = {
  maxStoredErrors: 500,
  reportingBatchSize: 10,
  reportingInterval: 30000, // 30 seconds
  criticalErrorThreshold: 5, // Critical errors in 5 minutes trigger alert
  errorRateThreshold: 10, // Errors per minute threshold
  retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

// Error storage manager
class ErrorStorage {
  private storageKey = 'myK9Show_error_logs';

  getStoredErrors(): StructuredError[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return [];
      
      const errors = JSON.parse(stored) as StructuredError[];
      
      // Filter out old errors
      const cutoff = Date.now() - MONITORING_CONFIG.retentionPeriod;
      return errors.filter(error => error.context.timestamp > cutoff);
    } catch (error) {
      logger.error('Failed to load stored errors:', 'lib', {}, error as Error);
      return [];
    }
  }

  storeError(error: StructuredError): void {
    try {
      const errors = this.getStoredErrors();
      errors.push(error);
      
      // Keep only the most recent errors
      if (errors.length > MONITORING_CONFIG.maxStoredErrors) {
        errors.splice(0, errors.length - MONITORING_CONFIG.maxStoredErrors);
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(errors));
    } catch (error) {
      logger.error('Failed to store error:', 'lib', {}, error as Error);
    }
  }

  clearErrors(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      logger.error('Failed to clear errors:', 'lib', {}, error as Error);
    }
  }

  getErrorMetrics(): ErrorMetrics {
    const errors = this.getStoredErrors();
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    const last5min = now - (5 * 60 * 1000);
    
    // Calculate metrics
    const totalErrors = errors.length;
    
    const errorsBySeverity = errors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1;
      return acc;
    }, {} as Record<ErrorSeverity, number>);
    
    const errorsByCategory = errors.reduce((acc, error) => {
      acc[error.category] = (acc[error.category] || 0) + 1;
      return acc;
    }, {} as Record<ErrorCategory, number>);
    
    const recentErrors = errors.filter(e => e.context.timestamp > last5min);
    const recentErrorRate = recentErrors.length / 5; // errors per minute
    
    const criticalErrorsLast24h = errors.filter(
      e => e.severity === 'critical' && e.context.timestamp > last24h
    ).length;
    
    const networkErrorsLast24h = errors.filter(
      e => e.category === 'network' && e.context.timestamp > last24h
    ).length;
    
    // Calculate user impact score (0-100)
    const impactWeights = { none: 0, minor: 1, major: 3, blocking: 5 };
    const totalImpact = errors.reduce((sum, error) => sum + impactWeights[error.userImpact], 0);
    const userImpactScore = Math.min(100, (totalImpact / Math.max(1, errors.length)) * 20);
    
    // Top error messages
    const messageCounts = errors.reduce((acc, error) => {
      acc[error.message] = (acc[error.message] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topErrorMessages = Object.entries(messageCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));
    
    // Error trends (simplified - would need more sophisticated analysis in production)
    const errorTrends = {
      increasing: Object.entries(errorsByCategory)
        .filter(([, count]) => count > 5)
        .map(([category]) => category),
      decreasing: [],
    };
    
    return {
      totalErrors,
      errorsBySeverity: {
        low: errorsBySeverity.low || 0,
        medium: errorsBySeverity.medium || 0,
        high: errorsBySeverity.high || 0,
        critical: errorsBySeverity.critical || 0,
      },
      errorsByCategory: {
        network: errorsByCategory.network || 0,
        validation: errorsByCategory.validation || 0,
        database: errorsByCategory.database || 0,
        authentication: errorsByCategory.authentication || 0,
        authorization: errorsByCategory.authorization || 0,
        ui: errorsByCategory.ui || 0,
        performance: errorsByCategory.performance || 0,
        unknown: errorsByCategory.unknown || 0,
      },
      recentErrorRate,
      criticalErrorsLast24h,
      networkErrorsLast24h,
      userImpactScore,
      topErrorMessages,
      errorTrends,
    };
  }
}

// Error classifier
export class ErrorClassifier {
  static classifyError(error: Error, context: Partial<ErrorContext> = {}): {
    severity: ErrorSeverity;
    category: ErrorCategory;
    userImpact: StructuredError['userImpact'];
    retryable: boolean;
  } {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';
    
    // Classify by message content
    let category: ErrorCategory = 'unknown';
    let severity: ErrorSeverity = 'medium';
    let userImpact: StructuredError['userImpact'] = 'minor';
    let retryable = false;
    
    // Network errors
    if (message.includes('network') || 
        message.includes('fetch') || 
        message.includes('connection') ||
        message.includes('timeout') ||
        error.name === 'NetworkError') {
      category = 'network';
      retryable = true;
      userImpact = context.networkStatus === 'offline' ? 'major' : 'minor';
    }
    
    // Database errors
    else if (message.includes('database') ||
             message.includes('sql') ||
             message.includes('supabase') ||
             stack.includes('postgres')) {
      category = 'database';
      severity = 'high';
      userImpact = 'major';
      retryable = true;
    }
    
    // Validation errors
    else if (message.includes('validation') ||
             message.includes('invalid') ||
             message.includes('required') ||
             error.name === 'ValidationError') {
      category = 'validation';
      severity = 'low';
      userImpact = 'minor';
      retryable = false;
    }
    
    // Authentication errors
    else if (message.includes('auth') ||
             message.includes('login') ||
             message.includes('token') ||
             message.includes('unauthorized') ||
             error.name === 'AuthError') {
      category = 'authentication';
      severity = 'high';
      userImpact = 'blocking';
      retryable = false;
    }
    
    // Authorization errors
    else if (message.includes('permission') ||
             message.includes('forbidden') ||
             message.includes('access denied') ||
             error.name === 'AuthorizationError') {
      category = 'authorization';
      severity = 'medium';
      userImpact = 'major';
      retryable = false;
    }
    
    // UI/React errors
    else if (message.includes('react') ||
             message.includes('component') ||
             message.includes('render') ||
             stack.includes('react')) {
      category = 'ui';
      severity = message.includes('crash') ? 'critical' : 'medium';
      userImpact = message.includes('crash') ? 'blocking' : 'minor';
      retryable = false;
    }
    
    // Performance errors
    else if (message.includes('timeout') ||
             message.includes('slow') ||
             message.includes('performance') ||
             message.includes('memory')) {
      category = 'performance';
      severity = 'medium';
      userImpact = 'minor';
      retryable = true;
    }
    
    // Critical error indicators
    if (message.includes('crash') ||
        message.includes('fatal') ||
        message.includes('critical') ||
        error.name === 'FatalError') {
      severity = 'critical';
      userImpact = 'blocking';
    }
    
    return { severity, category, userImpact, retryable };
  }

  static suggestResolution(error: StructuredError): StructuredError['resolution'] {
    const { category, retryable } = error;
    
    switch (category) {
      case 'network':
        return {
          suggested: 'Check your internet connection and try again',
          automated: retryable,
          steps: [
            'Verify internet connectivity',
            'Check if the service is available',
            'Retry the operation',
            'Try again later if the issue persists'
          ]
        };
        
      case 'validation':
        return {
          suggested: 'Please check your input and correct any validation errors',
          automated: false,
          steps: [
            'Review the form for missing or invalid fields',
            'Ensure all required fields are filled',
            'Check data format requirements',
            'Resubmit the form'
          ]
        };
        
      case 'authentication':
        return {
          suggested: 'Please log in again',
          automated: false,
          steps: [
            'Log out and log back in',
            'Clear browser cache and cookies',
            'Reset password if needed',
            'Contact support if problem persists'
          ]
        };
        
      case 'authorization':
        return {
          suggested: 'You do not have permission to perform this action',
          automated: false,
          steps: [
            'Contact your administrator for access',
            'Verify your user role',
            'Check if your account is active',
            'Try a different approach if available'
          ]
        };
        
      case 'database':
        return {
          suggested: 'A database error occurred. Please try again',
          automated: retryable,
          steps: [
            'Wait a moment and try again',
            'Refresh the page',
            'Check for any ongoing maintenance',
            'Contact support if issue continues'
          ]
        };
        
      default:
        return {
          suggested: 'An unexpected error occurred. Please try again',
          automated: retryable,
          steps: [
            'Refresh the page',
            'Try the operation again',
            'Check browser console for details',
            'Contact support with error details'
          ]
        };
    }
  }
}

// Error monitoring manager
export class ErrorMonitor {
  private storage = new ErrorStorage();
  private reportingQueue: StructuredError[] = [];
  private sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  constructor() {
    this.setupGlobalErrorHandlers();
    this.startReportingLoop();
  }

  private setupGlobalErrorHandlers(): void {
    if (typeof window === 'undefined') return;

    // Handle uncaught JavaScript errors
    window.addEventListener('error', (event) => {
      this.captureError(event.error || new Error(event.message), {
        url: window.location.href,
        additionalData: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        }
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      this.captureError(error, {
        url: window.location.href,
        additionalData: {
          type: 'unhandledrejection',
          reason: event.reason,
        }
      });
    });
  }

  private startReportingLoop(): void {
    setInterval(() => {
      this.processReportingQueue();
    }, MONITORING_CONFIG.reportingInterval);
  }

  private processReportingQueue(): void {
    if (this.reportingQueue.length === 0) return;

    const batch = this.reportingQueue.splice(0, MONITORING_CONFIG.reportingBatchSize);
    
    // In production, this would send to an error reporting service
    console.group('Error Monitoring Report');
    console.table(batch.map(error => ({
      id: error.id,
      severity: error.severity,
      category: error.category,
      message: error.message,
      userImpact: error.userImpact,
      timestamp: new Date(error.context.timestamp).toISOString(),
    })));
    console.groupEnd();
    
    // Check for critical error threshold
    const criticalErrors = batch.filter(e => e.severity === 'critical');
    if (criticalErrors.length >= MONITORING_CONFIG.criticalErrorThreshold) {
      this.triggerCriticalAlert(criticalErrors);
    }
  }

  private triggerCriticalAlert(errors: StructuredError[]): void {
    logger.error('🚨 CRITICAL ERROR THRESHOLD EXCEEDED', 'lib', { data: {
      count: errors.length,
      threshold: MONITORING_CONFIG.criticalErrorThreshold,
      errors: errors.map(e => ({ message: e.message, context: e.context }))
    } });
    
    // In production, this would trigger alerts (email, Slack, etc.)
  }

  captureError(error: Error, context: Partial<ErrorContext> = {}): StructuredError {
    const classification = ErrorClassifier.classifyError(error, context);
    
    // Build context with only defined optional properties
    const baseContext: ErrorContext = {
      sessionId: context.sessionId ?? this.sessionId,
      userAgent: context.userAgent ?? (typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown'),
      url: context.url ?? (typeof window !== 'undefined' ? window.location.href : 'unknown'),
      timestamp: context.timestamp ?? Date.now(),
      ...(context.userId !== undefined && { userId: context.userId }),
      ...(context.userRole !== undefined && { userRole: context.userRole }),
      ...((context.buildVersion ?? process.env.VITE_APP_VERSION) !== undefined && { buildVersion: context.buildVersion ?? process.env.VITE_APP_VERSION ?? 'unknown' }),
      ...(context.networkStatus !== undefined && { networkStatus: context.networkStatus }),
      ...(context.operationType !== undefined && { operationType: context.operationType }),
      ...(context.entityType !== undefined && { entityType: context.entityType }),
      ...(context.queryKey !== undefined && { queryKey: context.queryKey }),
      ...(context.additionalData !== undefined && { additionalData: context.additionalData }),
    };

    const resolutionResult = ErrorClassifier.suggestResolution({
      id: '',
      message: error.message,
      ...classification,
      context: {} as ErrorContext,
    });

    const structuredError: StructuredError = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: error.message,
      ...(error.stack !== undefined && { stack: error.stack }),
      ...classification,
      context: baseContext,
      ...(resolutionResult !== undefined && {
        resolution: {
          suggested: resolutionResult.suggested,
          ...(resolutionResult.automated !== undefined && { automated: resolutionResult.automated }),
          ...(resolutionResult.steps !== undefined && { steps: resolutionResult.steps }),
        }
      }),
    };
    
    // Store error
    this.storage.storeError(structuredError);
    
    // Add to reporting queue
    this.reportingQueue.push(structuredError);
    
    return structuredError;
  }

  getMetrics(): ErrorMetrics {
    return this.storage.getErrorMetrics();
  }

  getRecentErrors(limit = 20): StructuredError[] {
    return this.storage.getStoredErrors()
      .sort((a, b) => b.context.timestamp - a.context.timestamp)
      .slice(0, limit);
  }

  clearErrors(): void {
    this.storage.clearErrors();
    this.reportingQueue = [];
  }
}

// Global error monitor instance
export const errorMonitor = new ErrorMonitor();

// Hook for error monitoring
export const useErrorMonitoring = () => {
  const queryClient = useQueryClient();

  // Set up React Query error handling
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.error) {
        const error = event.query.state.error as Error;
        errorMonitor.captureError(error, {
          operationType: 'read',
          queryKey: event.query.queryKey,
          additionalData: {
            queryHash: event.query.queryHash,
            dataUpdatedAt: event.query.state.dataUpdatedAt,
          }
        });
      }
    });

    return unsubscribe;
  }, [queryClient]);

  // Set up mutation error handling
  useEffect(() => {
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.mutation.state.error) {
        const error = event.mutation.state.error as Error;
        const mutationKey = event.mutation.options.mutationKey;
        
        let operationType: 'create' | 'update' | 'delete' = 'create';
        if (mutationKey && Array.isArray(mutationKey)) {
          if (mutationKey.includes('update')) operationType = 'update';
          else if (mutationKey.includes('delete')) operationType = 'delete';
        }
        
        errorMonitor.captureError(error, {
          operationType,
          additionalData: {
            mutationKey,
            variables: event.mutation.state.variables,
          }
        });
      }
    });

    return unsubscribe;
  }, [queryClient]);

  const captureError = useCallback((error: Error, context?: Partial<ErrorContext>) => {
    return errorMonitor.captureError(error, context);
  }, []);

  return {
    captureError,
    getMetrics: () => errorMonitor.getMetrics(),
    getRecentErrors: (limit?: number) => errorMonitor.getRecentErrors(limit),
    clearErrors: () => errorMonitor.clearErrors(),
  };
};