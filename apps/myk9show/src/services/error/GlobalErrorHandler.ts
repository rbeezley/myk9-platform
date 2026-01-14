/**
 * GlobalErrorHandler - Centralized error handling for unhandled JavaScript errors
 * and promise rejections
 * 
 * Integrates with existing LoggingService and MonitoringService for comprehensive
 * error tracking and reporting
 */

import { LoggingService } from '@/services/LoggingService';
import { MonitoringService } from '@/services/MonitoringService';
import { logger } from '@/services/LoggingService';

interface ErrorDetails {
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  timestamp: number;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId: string;
  errorType: 'javascript' | 'promise' | 'network' | 'chunk' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface NetworkErrorDetails extends ErrorDetails {
  requestUrl?: string;
  method?: string;
  statusCode?: number;
  responseText?: string;
}

interface ChunkLoadErrorDetails extends ErrorDetails {
  chunkName?: string;
  scriptUrl?: string;
}

class GlobalErrorHandler {
  private loggingService: LoggingService;
  private monitoringService: MonitoringService;
  private sessionId: string;
  private isInitialized = false;
  private errorQueue: ErrorDetails[] = [];
  private maxQueueSize = 100;
  private readonly ignoredErrors = new Set([
    // Common browser extension errors to ignore
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    'Script error',
    // Add more patterns as needed
  ]);

  constructor() {
    this.loggingService = LoggingService.getInstance();
    this.monitoringService = MonitoringService.getInstance();
    this.sessionId = this.generateSessionId();
  }

  /**
   * Initialize global error handlers
   */
  initialize(): void {
    if (this.isInitialized) {
      logger.warn('GlobalErrorHandler already initialized', 'services', {});
      return;
    }

    // Handle uncaught JavaScript errors
    window.addEventListener('error', this.handleJavaScriptError.bind(this));

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', this.handlePromiseRejection.bind(this));

    // Handle chunk loading errors (for code splitting)
    this.setupChunkErrorHandling();

    // Handle network errors (if needed)
    this.setupNetworkErrorHandling();

    this.isInitialized = true;
    
    this.loggingService.info('GlobalErrorHandler initialized', 'error-handler', {
      sessionId: this.sessionId,
      timestamp: Date.now()
    });
  }

  /**
   * Clean up error handlers
   */
  destroy(): void {
    if (!this.isInitialized) return;

    window.removeEventListener('error', this.handleJavaScriptError.bind(this));
    window.removeEventListener('unhandledrejection', this.handlePromiseRejection.bind(this));

    this.isInitialized = false;
    this.flushErrorQueue();
  }

  /**
   * Handle uncaught JavaScript errors
   */
  private handleJavaScriptError(event: ErrorEvent): void {
    const errorDetails: ErrorDetails = {
      message: event.message || 'Unknown JavaScript error',
      stack: event.error?.stack,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.sessionId,
      errorType: 'javascript',
      severity: this.classifyErrorSeverity(event.error || new Error(event.message))
    };

    // Check if this error should be ignored
    if (this.shouldIgnoreError(errorDetails.message)) {
      return;
    }

    this.processError(errorDetails);
  }

  /**
   * Handle unhandled promise rejections
   */
  private handlePromiseRejection(event: PromiseRejectionEvent): void {
    let errorMessage = 'Unhandled Promise Rejection';
    let stack: string | undefined;

    // Extract meaningful error information
    if (event.reason instanceof Error) {
      errorMessage = event.reason.message;
      stack = event.reason.stack;
    } else if (typeof event.reason === 'string') {
      errorMessage = event.reason;
    } else if (event.reason && typeof event.reason === 'object') {
      errorMessage = JSON.stringify(event.reason);
    }

    const errorDetails: ErrorDetails = {
      message: errorMessage,
      stack,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.sessionId,
      errorType: 'promise',
      severity: this.classifyPromiseRejectionSeverity(event.reason)
    };

    this.processError(errorDetails);

    // Prevent the error from being logged to console (optional)
    if (process.env.NODE_ENV === 'production') {
      event.preventDefault();
    }
  }

  /**
   * Setup chunk loading error handling for code splitting
   */
  private setupChunkErrorHandling(): void {
    const originalAppendChild = Element.prototype.appendChild;
    
    Element.prototype.appendChild = function<T extends Node>(node: T): T {
      if (node instanceof HTMLScriptElement) {
        node.addEventListener('error', () => {
          const errorDetails: ChunkLoadErrorDetails = {
            message: `Failed to load chunk: ${node.src}`,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            sessionId: GlobalErrorHandler.getInstance().sessionId,
            errorType: 'chunk',
            severity: 'high',
            scriptUrl: node.src,
            chunkName: GlobalErrorHandler.getInstance().extractChunkName(node.src)
          };

          GlobalErrorHandler.getInstance().processError(errorDetails);
        });
      }
      
      return originalAppendChild.call(this, node) as T;
    };
  }

  /**
   * Setup network error handling
   */
  private setupNetworkErrorHandling(): void {
    // Intercept fetch calls to handle network errors
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        if (!response.ok) {
          const errorDetails: NetworkErrorDetails = {
            message: `Network request failed: ${response.status} ${response.statusText}`,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            sessionId: this.sessionId,
            errorType: 'network',
            severity: this.classifyNetworkErrorSeverity(response.status),
            requestUrl: typeof args[0] === 'string' ? args[0] : (args[0] as Request).url,
            method: args[1]?.method || 'GET',
            statusCode: response.status
          };

          this.processError(errorDetails);
        }
        
        return response;
      } catch (error) {
        const errorDetails: NetworkErrorDetails = {
          message: `Network request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          url: window.location.href,
          sessionId: this.sessionId,
          errorType: 'network',
          severity: 'high',
          requestUrl: typeof args[0] === 'string' ? args[0] : (args[0] as Request).url,
          method: args[1]?.method || 'GET'
        };

        this.processError(errorDetails);
        throw error;
      }
    };
  }

  /**
   * Process and route errors to appropriate services
   */
  private processError(errorDetails: ErrorDetails): void {
    // Add to queue for batch processing
    this.errorQueue.push(errorDetails);
    
    // Trim queue if it gets too large
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue = this.errorQueue.slice(-this.maxQueueSize);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      logger.error('GlobalErrorHandler captured error:', 'services', { ...errorDetails });
    }

    // Send to logging service
    this.loggingService.error(errorDetails.message, 'error-handler', {
      ...errorDetails,
      component: 'GlobalErrorHandler'
    });

    // Send to monitoring service
    this.monitoringService.recordError(errorDetails.message, 'error-handler');

    // Handle critical errors immediately
    if (errorDetails.severity === 'critical') {
      this.handleCriticalError(errorDetails);
    }
  }

  /**
   * Handle critical errors that require immediate attention
   */
  private handleCriticalError(errorDetails: ErrorDetails): void {
    // Show user-friendly error message for critical errors
    if (typeof window !== 'undefined') {
      // Only show once per session to avoid spam
      const criticalErrorKey = 'criticalErrorShown';
      if (!sessionStorage.getItem(criticalErrorKey)) {
        sessionStorage.setItem(criticalErrorKey, 'true');
        
        // Could integrate with toast/notification system here
        logger.error('Critical error detected:', 'error', { detail: errorDetails.message });
      }
    }

    // Immediate flush for critical errors
    this.flushErrorQueue();
  }

  /**
   * Classify error severity based on error characteristics
   */
  private classifyErrorSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
    const message = error.message.toLowerCase();
    
    // Critical errors that break core functionality
    if (message.includes('chunk') || message.includes('module') || message.includes('cannot read prop')) {
      return 'critical';
    }
    
    // High severity errors
    if (message.includes('network') || message.includes('fetch') || message.includes('cors')) {
      return 'high';
    }
    
    // Medium severity errors
    if (message.includes('warning') || message.includes('deprecated')) {
      return 'medium';
    }
    
    // Default to medium for unknown errors
    return 'medium';
  }

  /**
   * Classify promise rejection severity
   */
  private classifyPromiseRejectionSeverity(reason: unknown): 'low' | 'medium' | 'high' | 'critical' {
    if (reason instanceof Error) {
      return this.classifyErrorSeverity(reason);
    }
    
    // Non-Error rejections are typically less severe
    return 'medium';
  }

  /**
   * Classify network error severity based on status code
   */
  private classifyNetworkErrorSeverity(statusCode: number): 'low' | 'medium' | 'high' | 'critical' {
    if (statusCode >= 500) return 'critical';
    if (statusCode >= 400) return 'high';
    if (statusCode >= 300) return 'medium';
    return 'low';
  }

  /**
   * Check if an error should be ignored
   */
  private shouldIgnoreError(message: string): boolean {
    return Array.from(this.ignoredErrors).some(pattern => 
      message.includes(pattern)
    );
  }

  /**
   * Extract chunk name from script URL
   */
  private extractChunkName(url: string): string {
    const match = url.match(/([^/]+)\.js$/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Flush error queue (useful for cleanup or immediate processing)
   */
  private flushErrorQueue(): void {
    if (this.errorQueue.length > 0) {
      this.loggingService.info(`Flushing ${this.errorQueue.length} queued errors`, 'error-handler', {
        sessionId: this.sessionId
      });
      this.errorQueue = [];
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    sessionId: string;
  } {
    const errorsByType: Record<string, number> = {};
    const errorsBySeverity: Record<string, number> = {};
    
    this.errorQueue.forEach(error => {
      errorsByType[error.errorType] = (errorsByType[error.errorType] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    });

    return {
      totalErrors: this.errorQueue.length,
      errorsByType,
      errorsBySeverity,
      sessionId: this.sessionId
    };
  }

  /**
   * Singleton instance
   */
  private static instance: GlobalErrorHandler;
  
  static getInstance(): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new GlobalErrorHandler();
    }
    return GlobalErrorHandler.instance;
  }
}

export { GlobalErrorHandler, type ErrorDetails, type NetworkErrorDetails, type ChunkLoadErrorDetails };