// Shared utilities for store compatibility hooks (useClassStoreCompat, useDogStoreCompat)

/**
 * Aggregates errors from multiple React Query queries/mutations,
 * returning the first error message or null if none.
 */
export function aggregateQueryErrors(
  ...errors: (Error | null | undefined)[]
): string | null {
  const firstError = errors.find(Boolean);
  if (!firstError) return null;
  return firstError.message || 'An error occurred';
}

/**
 * Returns true if any of the provided boolean states are true.
 * Used to combine loading/pending states from multiple queries/mutations.
 */
export function aggregateLoadingStates(...states: boolean[]): boolean {
  return states.some(Boolean);
}
