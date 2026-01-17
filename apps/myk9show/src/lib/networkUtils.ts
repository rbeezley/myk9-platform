/**
 * Network utilities for robust error handling, retry logic, and exponential backoff
 */

import React from 'react';
import { logger } from '@/services/LoggingService';

// Network error types
export enum NetworkErrorType {
  TIMEOUT = 'timeout',
  CONNECTION_ERROR = 'connection_error',
  SERVER_ERROR = 'server_error',
  CLIENT_ERROR = 'client_error',
  RATE_LIMIT = 'rate_limit',
  UNKNOWN = 'unknown'
}

export interface NetworkError extends Error {
  type: NetworkErrorType;
  status?: number;
  retryAfter?: number;
  isRetryable: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // Base delay in milliseconds
  maxDelay: number; // Maximum delay in milliseconds
  backoffFactor: number; // Exponential backoff multiplier
  jitter: boolean; // Add random jitter to prevent thundering herd
}

export interface RequestConfig extends RequestInit {
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
  jitter: true
};

/**
 * Enhanced fetch with automatic retry, timeout, and error handling
 */
export class NetworkClient {
  private defaultConfig: RetryConfig;

  constructor(defaultRetryConfig?: Partial<RetryConfig>) {
    this.defaultConfig = { ...DEFAULT_RETRY_CONFIG, ...defaultRetryConfig };
  }

  /**
   * Classify network errors for appropriate handling
   */
  private classifyError(error: Error, response?: Response): NetworkError {
    let type = NetworkErrorType.UNKNOWN;
    let isRetryable = false;
    let retryAfter: number | undefined;

    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      type = NetworkErrorType.TIMEOUT;
      isRetryable = true;
    } else if (!response) {
      type = NetworkErrorType.CONNECTION_ERROR;
      isRetryable = true;
    } else {
      const status = response.status;
      
      if (status >= 500) {
        type = NetworkErrorType.SERVER_ERROR;
        isRetryable = true;
      } else if (status === 429) {
        type = NetworkErrorType.RATE_LIMIT;
        isRetryable = true;
        const retryAfterHeader = response.headers.get('Retry-After');
        if (retryAfterHeader) {
          retryAfter = parseInt(retryAfterHeader) * 1000; // Convert to milliseconds
        }
      } else if (status >= 400) {
        type = NetworkErrorType.CLIENT_ERROR;
        isRetryable = false; // Client errors are typically not retryable
      }
    }

    const networkError: NetworkError = {
      ...error,
      type,
      status: response?.status,
      retryAfter,
      isRetryable,
      message: error.message || `Network error: ${type}`
    };

    return networkError;
  }

  /**
   * Calculate delay for exponential backoff with optional jitter
   */
  private calculateDelay(attempt: number, config: RetryConfig, retryAfter?: number): number {
    if (retryAfter) {
      return Math.min(retryAfter, config.maxDelay);
    }

    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt);
    
    if (config.jitter) {
      // Add ±25% jitter
      const jitterRange = delay * 0.25;
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }

    return Math.min(delay, config.maxDelay);
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enhanced fetch with retry logic
   */
  async fetch(url: string, config: RequestConfig = {}): Promise<Response> {
    const retryConfig = { ...this.defaultConfig, ...config.retryConfig };
    const { timeout = 30000, ...fetchConfig } = config;

    let lastError: NetworkError | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...fetchConfig,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check if response indicates an error
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          const networkError = this.classifyError(error, response);
          
          if (!networkError.isRetryable || attempt === retryConfig.maxRetries) {
            throw networkError;
          }
          
          lastError = networkError;
        } else {
          // Success - return response
          return response;
        }
      } catch (error) {
        const networkError = this.classifyError(error as Error);
        
        if (!networkError.isRetryable || attempt === retryConfig.maxRetries) {
          throw networkError;
        }
        
        lastError = networkError;
      }

      // Calculate delay before retry
      if (attempt < retryConfig.maxRetries) {
        const delay = this.calculateDelay(attempt, retryConfig, lastError?.retryAfter);
        logger.debug(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries})`, 'lib', {});
        await this.sleep(delay);
      }
    }

    // This should never be reached, but just in case
    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * JSON-specific fetch with automatic parsing
   */
  async fetchJson<T = unknown>(url: string, config: RequestConfig = {}): Promise<T> {
    const response = await this.fetch(url, {
      ...config,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * POST request with JSON payload
   */
  async post<T = unknown>(url: string, data: unknown, config: RequestConfig = {}): Promise<T> {
    return this.fetchJson<T>(url, {
      ...config,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * PUT request with JSON payload
   */
  async put<T = unknown>(url: string, data: unknown, config: RequestConfig = {}): Promise<T> {
    return this.fetchJson<T>(url, {
      ...config,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(url: string, config: RequestConfig = {}): Promise<T> {
    return this.fetchJson<T>(url, {
      ...config,
      method: 'DELETE'
    });
  }
}

// Default network client instance
export const networkClient = new NetworkClient();

/**
 * React hook for network operations with state management
 */
export interface NetworkState<T> {
  data: T | null;
  loading: boolean;
  error: NetworkError | null;
  retry: () => void;
}

export function useNetworkRequest<T>(
  requestFn: () => Promise<T>,
  dependencies: React.DependencyList = []
): NetworkState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<NetworkError | null>(null);

  const executeRequest = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await requestFn();
      setData(result);
    } catch (err) {
      setError(err as NetworkError);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestFn, ...dependencies]);

  React.useEffect(() => {
    executeRequest();
  }, [executeRequest]);

  return {
    data,
    loading,
    error,
    retry: executeRequest
  };
}

/**
 * Online/offline status hook
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Network quality detection
 */
export interface NetworkQuality {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
  downlink: number; // Mbps
  rtt: number; // Round trip time in ms
}

export function useNetworkQuality(): NetworkQuality | null {
  const [quality, setQuality] = React.useState<NetworkQuality | null>(null);

  React.useEffect(() => {
    // @ts-expect-error - NetworkInformation is experimental
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    if (connection) {
      const updateQuality = () => {
        setQuality({
          effectiveType: connection.effectiveType || 'unknown',
          downlink: connection.downlink || 0,
          rtt: connection.rtt || 0
        });
      };

      updateQuality();
      connection.addEventListener('change', updateQuality);

      return () => {
        connection.removeEventListener('change', updateQuality);
      };
    }
    return undefined;
  }, []);

  return quality;
}

/**
 * Error logging utility for capturing and reporting errors
 */
export class ErrorLogger {
  private errors: Array<{ error: Error; timestamp: Date; context?: Record<string, unknown> }> = [];
  private maxErrors = 100; // Limit stored errors to prevent memory leaks

  /**
   * Log an error with optional context
   */
  logError(error: Error, context?: Record<string, unknown>): void {
    const errorEntry = {
      error,
      timestamp: new Date(),
      context
    };

    this.errors.push(errorEntry);

    // Keep only the most recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // In development, also log to console
    if (process.env.NODE_ENV === 'development') {
      logger.error('Error logged:', 'lib', { data: error, context });
    }

    // In production, you might want to send to an error reporting service
    // this.sendToErrorService(errorEntry);
  }

  /**
   * Get all logged errors
   */
  getErrors(): Array<{ error: Error; timestamp: Date; context?: Record<string, unknown> }> {
    return [...this.errors];
  }

  /**
   * Clear all logged errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.errors.length;
  }

  /**
   * Check if there are any errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}