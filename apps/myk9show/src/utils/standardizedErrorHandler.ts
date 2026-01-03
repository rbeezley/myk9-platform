/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Standardized Error Handling Utilities
 * 
 * Provides consistent error handling patterns across the application
 * to replace scattered console.log/warn/error calls
 */

import { LoggingService } from '@/services/LoggingService';

const logger = LoggingService.getInstance();

export interface ErrorContext {
  operation: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorReport {
  error: Error | string;
  context: ErrorContext;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

/**
 * Centralized error reporting with consistent logging
 */
export class StandardErrorHandler {
  /**
   * Report a sync operation error (common in stores)
   */
  static reportSyncError(
    operation: 'create' | 'update' | 'delete' | 'queue',
    entityType: string,
    entityId: string,
    error: Error | string | unknown,
    metadata?: Record<string, unknown>
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
    
    logger.warn('Sync operation failed', 'store', {
      operation,
      entityType,
      entityId,
      error: errorMessage,
      metadata,
      timestamp: new Date().toISOString()
    });

    // For critical sync failures, also report to monitoring
    if (operation === 'create' || operation === 'delete') {
      logger.error('Critical sync operation failed', 'store', {
        operation,
        entityType,
        entityId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Report store operation errors
   */
  static reportStoreError(
    operation: string,
    storeName: string,
    error: Error | string | unknown,
    context?: Record<string, unknown>
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
    
    logger.error('Store operation failed', 'store', {
      operation,
      storeName,
      error: errorMessage,
      context,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Report validation errors
   */
  static reportValidationError(
    field: string,
    value: unknown,
    rule: string,
    error: string,
    context?: Record<string, unknown>
  ): void {
    logger.warn('Validation failed', 'validation', {
      field,
      value: typeof value === 'object' ? JSON.stringify(value) : value,
      rule,
      error,
      context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Report API/network errors
   */
  static reportNetworkError(
    endpoint: string,
    method: string,
    status?: number,
    error?: Error | string,
    context?: Record<string, unknown>
  ): void {
    const errorMessage = error instanceof Error ? error.message : error;
    
    logger.error('Network request failed', 'network', {
      endpoint,
      method,
      status,
      error: errorMessage,
      context,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Report component lifecycle errors
   */
  static reportComponentError(
    componentName: string,
    lifecycle: 'mount' | 'update' | 'unmount' | 'render',
    error: Error | string,
    props?: Record<string, unknown>
  ): void {
    const errorMessage = error instanceof Error ? error.message : error;
    
    logger.error('Component error', 'component', {
      componentName,
      lifecycle,
      error: errorMessage,
      props,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Report data migration/transformation errors
   */
  static reportMigrationError(
    migrationType: string,
    fromVersion: string | number,
    toVersion: string | number,
    error: Error | string,
    data?: unknown
  ): void {
    const errorMessage = error instanceof Error ? error.message : error;
    
    logger.error('Data migration failed', 'migration', {
      migrationType,
      fromVersion,
      toVersion,
      error: errorMessage,
      dataType: typeof data,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Report business logic warnings (non-critical issues)
   */
  static reportWarning(
    category: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    logger.warn(message, category, {
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Report informational events (for debugging/auditing)
   */
  static reportInfo(
    category: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    logger.info(message, category, {
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Report debugging information (development only)
   */
  static reportDebug(
    category: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    if (process.env.NODE_ENV === 'development') {
      logger.debug(message, category, {
        ...context,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Create a consistent error object with context
   */
  static createContextualError(
    message: string,
    context: ErrorContext,
    originalError?: Error
  ): Error {
    const contextualMessage = `${message} (${context.operation}${
      context.entityType ? ` - ${context.entityType}` : ''
    }${context.entityId ? `:${context.entityId}` : ''})`;

    const error = new Error(contextualMessage);
    
    if (originalError) {
      error.stack = originalError.stack;
      // Note: Error.cause is ES2022+, using custom property for compatibility
      (error as any).originalError = originalError;
    }

    // Add context as non-enumerable property
    Object.defineProperty(error, 'context', {
      value: context,
      writable: false,
      enumerable: false
    });

    return error;
  }

  /**
   * Safely execute an operation with error handling
   */
  static async safeExecute<T>(
    operation: () => Promise<T> | T,
    context: ErrorContext,
    onError?: (error: Error) => T
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      const contextualError = this.createContextualError(
        'Operation failed',
        context,
        error instanceof Error ? error : new Error(String(error))
      );

      this.reportStoreError(
        context.operation,
        context.entityType || 'unknown',
        contextualError,
        context.metadata
      );

      return onError ? onError(contextualError) : undefined;
    }
  }
}

/**
 * Convenience functions for common error patterns
 */

export const reportSyncError = StandardErrorHandler.reportSyncError;
export const reportStoreError = StandardErrorHandler.reportStoreError;
export const reportValidationError = StandardErrorHandler.reportValidationError;  
export const reportNetworkError = StandardErrorHandler.reportNetworkError;
export const reportComponentError = StandardErrorHandler.reportComponentError;
export const reportMigrationError = StandardErrorHandler.reportMigrationError;
export const reportWarning = StandardErrorHandler.reportWarning;
export const reportInfo = StandardErrorHandler.reportInfo;
export const reportDebug = StandardErrorHandler.reportDebug;
export const safeExecute = StandardErrorHandler.safeExecute;

/**
 * Migration helper to find and replace console.* calls
 */
export const ERROR_MIGRATION_PATTERNS = {
  // Replace console.warn patterns
  SYNC_WARNING: {
    pattern: /console\.warn\(['"`]Failed to queue (.+) for sync:['"`], syncError\)/g,
    replacement: `reportSyncError('queue', '$1', entityId, syncError)`
  },
  
  GENERIC_WARNING: {
    pattern: /console\.warn\((.+)\)/g,
    replacement: `reportWarning('general', $1)`
  },
  
  // Replace console.error patterns  
  STORE_ERROR: {
    pattern: /console\.error\(['"`](.+):['"`], error\)/g,
    replacement: `reportStoreError('$1', storeName, error)`
  },
  
  MIGRATION_ERROR: {
    pattern: /console\.error\(['"`]Migration error: (.+)['"`]\)/g,
    replacement: `reportMigrationError('data', 'unknown', 'unknown', '$1')`
  },
  
  GENERIC_ERROR: {
    pattern: /console\.error\((.+)\)/g,
    replacement: `reportStoreError('operation', 'unknown', $1)`
  }
};

/**
 * Type-safe error handling decorators for stores
 */
export function withErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  context: Omit<ErrorContext, 'metadata'>
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      StandardErrorHandler.reportStoreError(
        context.operation,
        context.entityType || 'unknown',
        error instanceof Error ? error : new Error(String(error)),
        { args }
      );
      throw error;
    }
  }) as T;
}