/**
 * TypeScript Utility Functions
 *
 * Helper functions to improve type safety and reduce TypeScript errors
 */

/**
 * Marks parameters as intentionally unused to satisfy noUnusedParameters
 * @param args - Arguments that are intentionally unused
 */
export function markUnused(...args: unknown[]): void {
  // This function explicitly does nothing - it's just to mark parameters as used
  void args;
}

/**
 * Type guard to check if a value is defined (not null or undefined)
 * @param value - Value to check
 * @returns Boolean indicating if value is defined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard to check if a value is not empty (not null, undefined, or empty string)
 * @param value - Value to check
 * @returns Boolean indicating if value is not empty
 */
export function isNotEmpty<T>(value: T | null | undefined | ''): value is T {
  return value !== null && value !== undefined && value !== '';
}

/**
 * Safe array access that returns undefined instead of throwing
 * @param array - Array to access
 * @param index - Index to access
 * @returns Array element or undefined
 */
export function safeArrayAccess<T>(array: T[] | undefined, index: number): T | undefined {
  return array?.[index];
}

/**
 * Safe object property access
 * @param obj - Object to access
 * @param key - Key to access
 * @returns Property value or undefined
 */
export function safePropAccess<T, K extends keyof T>(obj: T | undefined, key: K): T[K] | undefined {
  return obj?.[key];
}

/**
 * Exhaustive switch case checker
 * @param value - Value that should never be reached
 * @returns Never (throws error)
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

/**
 * Safe type assertion with runtime check
 * @param value - Value to assert
 * @param predicate - Type guard function
 * @param errorMessage - Error message if assertion fails
 * @returns Asserted value
 */
export function assertType<T>(
  value: unknown, 
  predicate: (val: unknown) => val is T, 
  errorMessage?: string
): T {
  if (!predicate(value)) {
    throw new Error(errorMessage || `Type assertion failed for value: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Creates a type-safe object property accessor
 * @param obj - Object to create accessor for
 * @returns Function that safely accesses object properties
 */
export function createSafeAccessor<T extends Record<string, unknown>>(obj: T) {
  return <K extends keyof T>(key: K): T[K] | undefined => {
    return obj[key];
  };
}

/**
 * Filters out undefined values from an array while maintaining type safety
 * @param array - Array potentially containing undefined values
 * @returns Array without undefined values
 */
export function filterDefined<T>(array: (T | undefined)[]): T[] {
  return array.filter(isDefined);
}

/**
 * Type-safe object keys accessor
 * @param obj - Object to get keys from
 * @returns Array of object keys
 */
export function getObjectKeys<T extends Record<string, unknown>>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}

/**
 * Type-safe object entries accessor
 * @param obj - Object to get entries from
 * @returns Array of [key, value] pairs
 */
export function getObjectEntries<T extends Record<string, unknown>>(obj: T): Array<[keyof T, T[keyof T]]> {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

/**
 * Safely converts a value to string
 * @param value - Value to convert
 * @param fallback - Fallback string if conversion fails
 * @returns String representation of value
 */
export function safeString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  
  try {
    return String(value);
  } catch {
    return fallback;
  }
}

/**
 * Safely converts a value to number
 * @param value - Value to convert
 * @param fallback - Fallback number if conversion fails
 * @returns Number representation of value
 */
export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  
  const parsed = Number(value);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Deep readonly type helper
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Makes an object deeply readonly
 * @param obj - Object to make readonly
 * @returns Deep readonly version of object
 */
export function deepFreeze<T extends object>(obj: T): DeepReadonly<T> {
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = (obj as Record<string, unknown>)[prop];
    if (value && typeof value === 'object') {
      deepFreeze(value as object);
    }
  });

  return Object.freeze(obj) as DeepReadonly<T>;
}