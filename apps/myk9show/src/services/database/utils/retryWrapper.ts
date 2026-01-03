import { DatabaseError } from '../supabaseClient';

// Exponential backoff configuration
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 1000; // 1 second
const DEFAULT_MAX_DELAY = 30000; // 30 seconds

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: unknown) => boolean;
}

// Default function to determine if an error is retryable
const defaultShouldRetry = (error: unknown): boolean => {
  // Type guard for error objects
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  
  const err = error as { message?: string; code?: string };
  
  // Network errors
  if (err.message?.includes('network') || err.message?.includes('fetch')) {
    return true;
  }
  
  // Database connection errors
  if (err.code === 'PGRST000' || err.code === '08P01') {
    return true;
  }
  
  // Rate limiting errors
  if (err.code === '429' || err.message?.includes('rate limit')) {
    return true;
  }
  
  // Timeout errors
  if (err.message?.includes('timeout')) {
    return true;
  }
  
  // Don't retry auth errors or bad requests
  if (err.code === 'PGRST301' || err.code === '400') {
    return false;
  }
  
  return false;
};

// Calculate delay with exponential backoff and jitter
const calculateDelay = (
  attempt: number, 
  baseDelay: number, 
  maxDelay: number
): number => {
  // Exponential backoff: delay = baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  
  // Add jitter (±25%) to prevent thundering herd
  const jitter = 0.25;
  const jitterAmount = exponentialDelay * jitter;
  const minDelay = exponentialDelay - jitterAmount;
  const maxDelayWithJitter = exponentialDelay + jitterAmount;
  
  // Random delay between min and max with jitter
  const delay = Math.random() * (maxDelayWithJitter - minDelay) + minDelay;
  
  // Cap at maxDelay
  return Math.min(delay, maxDelay);
};

// Sleep utility
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Main retry wrapper function
export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelay = DEFAULT_BASE_DELAY,
    maxDelay = DEFAULT_MAX_DELAY,
    shouldRetry = defaultShouldRetry,
  } = options;
  
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Execute the operation
      const result = await operation();
      
      // Success - return the result
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (attempt < maxRetries && shouldRetry(error)) {
        // Calculate delay for this attempt
        const delay = calculateDelay(attempt, baseDelay, maxDelay);
        
        // Log retry attempt in development
        if (import.meta.env.DEV) {
          console.log(
            `🔄 Retrying operation (attempt ${attempt + 1}/${maxRetries}) after ${Math.round(delay)}ms`,
            { error: error instanceof Error ? error.message : error }
          );
        }
        
        // Wait before retrying
        await sleep(delay);
        
        // Continue to next attempt
        continue;
      }
      
      // Max retries reached or non-retryable error
      break;
    }
  }
  
  // All retries exhausted - throw the last error
  throw lastError;
};

// Specialized retry wrapper for database operations
export const withDatabaseRetry = async <T>(
  operation: () => Promise<{ data: T | null; error: DatabaseError | null }>
): Promise<{ data: T | null; error: DatabaseError | null }> => {
  try {
    const result = await withRetry(
      async () => {
        const response = await operation();
        
        // If there's an error in the response, throw it to trigger retry logic
        if (response.error) {
          throw response.error;
        }
        
        return response;
      },
      {
        shouldRetry: (error) => {
          // Use default retry logic
          const shouldRetryDefault = defaultShouldRetry(error);
          
          // Additional database-specific retry conditions
          if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST504') {
            // Gateway timeout - retry
            return true;
          }
          
          if (error && typeof error === 'object' && 'message' in error && 
              typeof error.message === 'string' && 
              (error.message.includes('connection') || error.message.includes('ECONNREFUSED'))) {
            // Connection errors - retry
            return true;
          }
          
          return shouldRetryDefault;
        },
      }
    );
    
    return result;
  } catch (error) {
    // Return error in the expected format
    return {
      data: null,
      error: error as DatabaseError,
    };
  }
};

// Batch retry wrapper for multiple operations
export const withBatchRetry = async <T>(
  operations: Array<() => Promise<T>>,
  options: RetryOptions = {}
): Promise<Array<{ success: boolean; data?: T; error?: unknown }>> => {
  const results = await Promise.allSettled(
    operations.map(op => withRetry(op, options))
  );
  
  return results.map((result) => {
    if (result.status === 'fulfilled') {
      return { success: true, data: result.value };
    } else {
      return { success: false, error: result.reason };
    }
  });
};

// Performance monitoring wrapper with retry
export const withPerformanceAndRetry = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  options: RetryOptions = {}
): Promise<T> => {
  const startTime = performance.now();
  
  try {
    const result = await withRetry(operation, options);
    const duration = performance.now() - startTime;
    
    // Log slow operations in development
    if (import.meta.env.DEV && duration > 1000) {
      console.warn(`⚠️ Slow operation: ${operationName} took ${Math.round(duration)}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ Operation failed: ${operationName} after ${Math.round(duration)}ms`, error);
    throw error;
  }
};