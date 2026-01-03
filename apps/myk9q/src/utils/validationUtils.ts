/**
 * Validation Utilities
 *
 * Functions for validating application state, business rules, and data integrity.
 * Provides reusable validation logic for use across services and components.
 */

/**
 * Determine if class completion status should be checked
 *
 * **Performance Optimization**: Only check completion on first and last dog scored.
 * Avoids unnecessary database updates for middle entries.
 *
 * **Use Cases**:
 * - First dog scored: Check to mark class as "in_progress"
 * - Last dog scored: Check to mark class as "completed"
 * - Middle dogs: Skip check (optimization)
 *
 * @param scoredCount - Number of dogs already scored in the class
 * @param totalCount - Total number of dogs registered in the class
 * @param enableLogging - Whether to log the decision (default: true)
 * @returns true if completion check should be performed, false to skip
 *
 * @example
 * ```typescript
 * // First dog scored - should check
 * shouldCheckCompletion(1, 15) // true (marks class as in_progress)
 *
 * // Middle dog scored - skip check
 * shouldCheckCompletion(8, 15) // false (optimization)
 *
 * // Last dog scored - should check
 * shouldCheckCompletion(15, 15) // true (marks class as completed)
 *
 * // Suppress logging
 * shouldCheckCompletion(5, 10, false) // false (no console output)
 * ```
 */
export function shouldCheckCompletion(
  scoredCount: number,
  totalCount: number,
  _enableLogging = true
): boolean {
  // Check on first dog (to mark class as in_progress)
  if (scoredCount === 1) {
    return true;
  }

  // Check on last dog (to mark class as completed)
  if (scoredCount === totalCount) {
    return true;
  }

  // Skip check for all middle entries (performance optimization)
  return false;
}
