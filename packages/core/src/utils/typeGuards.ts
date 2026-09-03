/**
 * Type guard to check if a value is a plain object
 *
 * @example
 * if (isObject(value)) {
 *   // value is now typed as Record<string, unknown>
 *   console.log(value.someProperty);
 * }
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if a value is an array
 *
 * @example
 * if (isArray(value)) {
 *   // value is now typed as unknown[]
 *   console.log(value.length);
 * }
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Assert that a condition is true at runtime
 *
 * @example
 * assert(user.id > 0, 'User ID must be positive');
 * // Code continues with confidence that user.id > 0
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Exhaustiveness check for switch statements (compile-time only)
 *
 * @example
 * type Status = 'pending' | 'active' | 'complete';
 *
 * function handleStatus(status: Status) {
 *   switch (status) {
 *     case 'pending': return 'Waiting';
 *     case 'active': return 'Running';
 *     case 'complete': return 'Done';
 *     default: return assertNever(status); // TypeScript error if case missing
 *   }
 * }
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
