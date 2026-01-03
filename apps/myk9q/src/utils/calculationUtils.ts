/**
 * Calculation Utilities
 *
 * Mathematical and business logic calculations for AKC Scent Work scoring.
 * Provides reusable calculation functions for time, areas, and search metrics.
 */

/**
 * Calculate total search time from individual area times
 *
 * **AKC Scent Work Rule**: Total search time is the sum of all applicable area times.
 * Areas may be 1, 2, or 3 depending on element and level:
 * - All elements/levels: Area 1
 * - Interior Excellent/Master, Handler Discrimination Master: Areas 1 + 2
 * - Interior Master only: Areas 1 + 2 + 3
 *
 * @param area1Time - Time for Area 1 in seconds (may be undefined/null)
 * @param area2Time - Time for Area 2 in seconds (may be undefined/null)
 * @param area3Time - Time for Area 3 in seconds (may be undefined/null)
 * @returns Total time in seconds (sum of all non-null/undefined areas)
 *
 * @example
 * ```typescript
 * // Interior Master (3 areas)
 * calculateTotalAreaTime(45, 52, 38) // 135 seconds
 *
 * // Interior Excellent (2 areas)
 * calculateTotalAreaTime(45, 52, undefined) // 97 seconds
 *
 * // Containers Novice (1 area)
 * calculateTotalAreaTime(45, undefined, undefined) // 45 seconds
 *
 * // Handle null values
 * calculateTotalAreaTime(45, null, null) // 45 seconds
 *
 * // All areas missing
 * calculateTotalAreaTime(undefined, undefined, undefined) // 0 seconds
 * ```
 */
export function calculateTotalAreaTime(
  area1Time?: number | null,
  area2Time?: number | null,
  area3Time?: number | null
): number {
  let totalTime = 0;

  if (area1Time) {
    totalTime += area1Time;
  }

  if (area2Time) {
    totalTime += area2Time;
  }

  if (area3Time) {
    totalTime += area3Time;
  }

  return totalTime;
}
