/**
 * Error handling utilities for type-safe error management
 */

/**
 * Safely converts any caught value to an Error instance.
 *
 * In JavaScript, anything can be thrown, not just Error objects.
 * This utility ensures you always work with proper Error instances
 * in catch blocks, providing type safety and consistent error handling.
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (caught) {
 *   const error = ensureError(caught);
 *   logger.error('Operation failed:', error.message);
 *   // error is guaranteed to be an Error with .message, .name, .stack
 * }
 * ```
 */
export function ensureError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  // Handle string throws
  if (typeof value === 'string') {
    return new Error(value);
  }

  // Handle objects with message property
  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  ) {
    const error = new Error((value as { message: string }).message);
    // Preserve name if available
    if ('name' in value && typeof (value as { name: unknown }).name === 'string') {
      error.name = (value as { name: string }).name;
    }
    return error;
  }

  // Fallback: stringify the value
  try {
    return new Error(String(value));
  } catch {
    return new Error('Unknown error');
  }
}

/**
 * Type guard to check if a value is an Error-like object
 */
export function isErrorLike(value: unknown): value is { message: string; name?: string; stack?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  );
}

/**
 * Extracts an error message from any caught value
 *
 * @example
 * ```typescript
 * try {
 *   await operation();
 * } catch (caught) {
 *   toast.error(getErrorMessage(caught));
 * }
 * ```
 */
export function getErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (isErrorLike(value)) {
    return value.message;
  }

  try {
    return String(value);
  } catch {
    return 'Unknown error';
  }
}
