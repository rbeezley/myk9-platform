/**
 * Type Guard Utilities
 *
 * Provides type-safe runtime checks and type narrowing utilities
 * to replace `as any` assertions and non-null assertions (`!`)
 */

/**
 * Checks if a value is defined (not null or undefined)
 *
 * @example
 * const value: string | null = getValue();
 * if (isDefined(value)) {
 *   // value is now typed as string
 *   console.log(value.toUpperCase());
 * }
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}

/**
 * Asserts that a value is defined, throwing an error if not
 *
 * @example
 * const value = map.get(key);
 * assertDefined(value, `Key ${key} not found`);
 * // value is now typed as non-nullable
 * console.log(value.toUpperCase());
 *
 * @throws {Error} If value is null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string
): asserts value is T {
  if (value == null) {
    throw new Error(message);
  }
}

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
 * Type guard to check if an object has a specific property
 *
 * @example
 * if (hasProperty(obj, 'id')) {
 *   // obj is now typed to have 'id' property
 *   console.log(obj.id);
 * }
 */
export function hasProperty<K extends PropertyKey>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

/**
 * Type guard to check if a value is a string
 *
 * @example
 * if (isString(value)) {
 *   // value is now typed as string
 *   console.log(value.trim());
 * }
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a number
 *
 * @example
 * if (isNumber(value)) {
 *   // value is now typed as number
 *   console.log(value.toFixed(2));
 * }
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard to check if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
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
 * Type guard to check if a value is an array of a specific type
 *
 * @example
 * const isStringArray = isArrayOf(value, isString);
 * if (isStringArray) {
 *   // value is now typed as string[]
 *   value.forEach(str => console.log(str.toUpperCase()));
 * }
 */
export function isArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T
): value is T[] {
  return isArray(value) && value.every(guard);
}

/**
 * Type guard to check if a value is a function
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Type guard to check if a value is a Date instance
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Type guard to check if a value is a Promise
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return (
    isObject(value) &&
    isFunction((value as Record<string, unknown>).then) &&
    isFunction((value as Record<string, unknown>).catch)
  );
}

/**
 * Type guard to check if a value is nullish (null or undefined)
 */
export function isNullish(value: unknown): value is null | undefined {
  return value == null;
}

/**
 * Type guard to check if an object has all required properties
 *
 * @example
 * const requiredProps = ['id', 'name', 'email'] as const;
 * if (hasRequiredProperties(obj, requiredProps)) {
 *   // obj is now typed to have id, name, and email properties
 *   console.log(obj.id, obj.name, obj.email);
 * }
 */
export function hasRequiredProperties<K extends PropertyKey>(
  obj: unknown,
  keys: readonly K[]
): obj is Record<K, unknown> {
  if (!isObject(obj)) return false;
  return keys.every(key => key in obj);
}

/**
 * Safely get a property from an object, returning undefined if not found
 *
 * @example
 * const value = safeGet(obj, 'someProperty');
 * // value is unknown | undefined, avoiding the need for non-null assertion
 */
export function safeGet<K extends PropertyKey>(
  obj: unknown,
  key: K
): unknown | undefined {
  if (!isObject(obj)) return undefined;
  return obj[key];
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
