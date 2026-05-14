/**
 * APIErrorInterceptor - Standardized HTTP error handling with retry strategies
 * 
 * Provides consistent error responses, retry logic, fallback behaviors,
 * and user-friendly error messages for all API interactions
 */

import { LoggingService } from '@/services/LoggingService';
import { MonitoringService } from '@/services/MonitoringService';

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode?: number;
  timestamp: number;
  requestId?: string;
  retryable: boolean;
  userMessage: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrorTypes: string[];
}

export interface APIResponse<T = unknown> {
  data?: T;
  error?: APIError;
  success: boolean;
  cached?: boolean;
  retries?: number;
}

interface RequestConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
  skipErrorInterception?: boolean;
}

class APIErrorInterceptor {
  private loggingService: LoggingService;
  private monitoringService: MonitoringService;
  
  private readonly defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    retryableErrorTypes: ['NetworkError', 'TimeoutError', 'AbortError']
  };

  private readonly errorMessages: Record<number, string> = {
    400: 'Invalid request. Please check your input and try again.',
    401: 'You need to sign in to access this feature.',
    403: 'You don\'t have permission to perform this action.',
    404: 'The requested resource was not found.',
    408: 'Request timed out. Please try again.',
    409: 'This action conflicts with the current state. Please refresh and try again.',
    422: 'Invalid data provided. Please check the form and try again.',
    429: 'Too many requests. Please wait a moment and try again.',
    500: 'Server error occurred. Our team has been notified.',
    502: 'Service temporarily unavailable. Please try again in a moment.',
    503: 'Service under maintenance. Please try again later.',
    504: 'Request timed out. Please try again.'
  };

  private readonly fallbackMessages = {
    network: 'Network connection failed. Please check your internet connection.',
    timeout: 'Request timed out. Please try again.',
    unknown: 'An unexpected error occurred. Please try again.'
  };

  constructor() {
    this.loggingService = LoggingService.getInstance();
    this.monitoringService = MonitoringService.getInstance();
  }

  /**
   * Intercept and process API requests with error handling and retry logic
   */
  async interceptRequest<T = unknown>(config: RequestConfig): Promise<APIResponse<T>> {
    const startTime = performance.now();
    const requestId = this.generateRequestId();
    let retries = 0;

    const retryConfig = { ...this.defaultRetryConfig, ...config.retryConfig };

    // Log the API call start
    this.loggingService.info(`API call started: ${config.method} ${config.url}`, 'api', {
      requestId,
      headers: this.sanitizeHeaders(config.headers),
      timeout: config.timeout
    });

    while (retries <= retryConfig.maxRetries) {
      try {
        const response = await this.makeRequest<T>(config, requestId, retries);
        
        if (response.success) {
          // Log successful response
          const duration = performance.now() - startTime;
          this.logSuccessfulRequest(config, requestId, duration, retries);
          return response;
        }

        // Handle API error response
        if (response.error && !this.shouldRetry(response.error, retryConfig, retries)) {
          this.logFailedRequest(config, requestId, response.error, retries);
          return response;
        }

        // Prepare for retry
        if (retries < retryConfig.maxRetries) {
          const delay = this.calculateRetryDelay(retries, retryConfig);
          await this.delay(delay);
          retries++;
          continue;
        }

        // Max retries exceeded
        this.logFailedRequest(config, requestId, response.error!, retries);
        return response;

      } catch (error) {
        const apiError = this.createAPIError(error, config.url, requestId);
        
        if (!this.shouldRetry(apiError, retryConfig, retries) || retries >= retryConfig.maxRetries) {
          this.logFailedRequest(config, requestId, apiError, retries);
          return { success: false, error: apiError, retries };
        }

        // Prepare for retry
        const delay = this.calculateRetryDelay(retries, retryConfig);
        await this.delay(delay);
        retries++;
      }
    }

    // This should never be reached, but included for type safety
    const timeoutError = this.createTimeoutError(config.url, requestId);
    return { success: false, error: timeoutError, retries };
  }

  /**
   * Make the actual HTTP request
   */
  private async makeRequest<T>(config: RequestConfig, requestId: string, attempt: number): Promise<APIResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout || 10000);

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'X-Attempt': attempt.toString(),
          ...config.headers
        },
        ...(config.body !== undefined && { body: JSON.stringify(config.body) }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return { success: true, data, retries: attempt };
      }

      // Handle HTTP error responses
      const errorData = await this.extractErrorData(response);
      const apiError = this.createHTTPError(response, errorData, config.url, requestId);
      
      return { success: false, error: apiError };

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Extract error data from response
   */
  private async extractErrorData(response: Response): Promise<unknown> {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return { message: await response.text() };
    } catch {
      return { message: 'Failed to parse error response' };
    }
  }

  /**
   * Create APIError from HTTP response
   */
  private createHTTPError(response: Response, errorData: unknown, url: string, requestId: string): APIError {
    const statusCode = response.status;
    const serverMessage = (errorData as Record<string, unknown>)?.message || (errorData as Record<string, unknown>)?.error || response.statusText;
    
    return {
      code: `HTTP_${statusCode}`,
      message: String(serverMessage),
      details: {
        url,
        statusCode,
        statusText: response.statusText,
        responseData: errorData
      },
      statusCode,
      timestamp: Date.now(),
      requestId,
      retryable: this.defaultRetryConfig.retryableStatusCodes.includes(statusCode),
      userMessage: this.getUserFriendlyMessage(statusCode, String(serverMessage)),
      severity: this.getErrorSeverity(statusCode)
    };
  }

  /**
   * Create APIError from JavaScript error
   */
  private createAPIError(error: unknown, url: string, requestId: string): APIError {
    let code = 'UNKNOWN_ERROR';
    let message = 'An unexpected error occurred';
    let retryable = false;
    let userMessage = this.fallbackMessages.unknown;

    if (error instanceof TypeError && error.message.includes('fetch')) {
      code = 'NETWORK_ERROR';
      message = 'Network request failed';
      retryable = true;
      userMessage = this.fallbackMessages.network;
    } else if (error instanceof Error && error.name === 'AbortError') {
      code = 'TIMEOUT_ERROR';
      message = 'Request timed out';
      retryable = true;
      userMessage = this.fallbackMessages.timeout;
    } else if (error instanceof Error) {
      code = error.name.toUpperCase();
      message = error.message;
    }

    return {
      code,
      message,
      details: {
        url,
        originalError: String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      timestamp: Date.now(),
      requestId,
      retryable,
      userMessage,
      severity: retryable ? 'medium' : 'high'
    };
  }

  /**
   * Create timeout error
   */
  private createTimeoutError(url: string, requestId: string): APIError {
    return {
      code: 'TIMEOUT_ERROR',
      message: 'Request timed out after maximum retries',
      details: { url },
      timestamp: Date.now(),
      requestId,
      retryable: false,
      userMessage: this.fallbackMessages.timeout,
      severity: 'high'
    };
  }

  /**
   * Determine if request should be retried
   */
  private shouldRetry(error: APIError, config: RetryConfig, currentRetries: number): boolean {
    if (currentRetries >= config.maxRetries) return false;
    if (!error.retryable) return false;
    
    // Check if error code is retryable
    if (error.statusCode && config.retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }
    
    // Check if error type is retryable. Codes are stored as constants such as
    // NETWORK_ERROR while config values use class-like names such as NetworkError.
    const normalizedCode = error.code.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return config.retryableErrorTypes.some(type =>
      normalizedCode.includes(type.replace(/[^a-z0-9]/gi, '').toLowerCase())
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
    const jitter = Math.random() * 0.1 * delay; // Add up to 10% jitter
    return Math.min(delay + jitter, config.maxDelay);
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyMessage(statusCode?: number, serverMessage?: string): string {
    if (statusCode && this.errorMessages[statusCode]) {
      return this.errorMessages[statusCode];
    }
    
    // Try to extract useful information from server message
    if (serverMessage && typeof serverMessage === 'string') {
      // Check for common validation errors
      if (serverMessage.toLowerCase().includes('validation')) {
        return 'Please check your input and try again.';
      }
      if (serverMessage.toLowerCase().includes('permission')) {
        return 'You don\'t have permission to perform this action.';
      }
      if (serverMessage.toLowerCase().includes('not found')) {
        return 'The requested resource was not found.';
      }
    }
    
    return this.fallbackMessages.unknown;
  }

  /**
   * Get error severity based on status code
   */
  private getErrorSeverity(statusCode?: number): 'low' | 'medium' | 'high' | 'critical' {
    if (!statusCode) return 'medium';
    
    if (statusCode >= 500) return 'critical';
    if (statusCode >= 400 && statusCode < 500) return 'high';
    if (statusCode >= 300) return 'medium';
    return 'low';
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};
    
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log successful request
   */
  private logSuccessfulRequest(config: RequestConfig, requestId: string, duration: number, retries: number): void {
    this.loggingService.info(`API request successful: ${config.method} ${config.url}`, 'api', {
      requestId,
      duration,
      retries,
      url: config.url,
      method: config.method
    });

    this.monitoringService.recordPerformanceMetric('api_request_duration', duration, 'api');
  }

  /**
   * Log failed request
   */
  private logFailedRequest(config: RequestConfig, requestId: string, error: APIError, retries: number): void {
    this.loggingService.error(`API request failed: ${config.method} ${config.url}`, 'api', {
      requestId,
      error: error.code,
      message: error.message,
      statusCode: error.statusCode,
      retries,
      url: config.url,
      method: config.method
    });

    this.monitoringService.recordError(error.message, 'api');
  }

  /**
   * Singleton instance
   */
  private static instance: APIErrorInterceptor;
  
  static getInstance(): APIErrorInterceptor {
    if (!APIErrorInterceptor.instance) {
      APIErrorInterceptor.instance = new APIErrorInterceptor();
    }
    return APIErrorInterceptor.instance;
  }
}

export { APIErrorInterceptor };
