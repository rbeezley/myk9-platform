// ID generation utilities for Local-First architecture

/**
 * Generates a unique ID for optimistic updates
 * Uses a combination of timestamp and random string for uniqueness
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomStr}`;
}

/**
 * Generates a temporary ID that can be easily identified as optimistic
 */
export function generateOptimisticId(prefix: string = 'temp'): string {
  return `${prefix}_${generateId()}`;
}

/**
 * Checks if an ID is a temporary/optimistic ID
 */
export function isOptimisticId(id: string): boolean {
  return id.includes('temp_') || id.includes('-');
}

/**
 * Generates a UUID v4-like string
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}