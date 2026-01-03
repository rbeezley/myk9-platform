/**
 * Class Utilities
 *
 * Business logic utilities for handling AKC Scent Work class rules,
 * such as determining which areas apply to specific class types.
 */

/**
 * Result indicating which areas (1, 2, 3) are applicable for a class
 */
export interface AreaApplicability {
  /** Area 1 is always applicable */
  useArea1: boolean;
  /** Area 2 applicable for Interior Excellent/Master and Handler Discrimination Master */
  useArea2: boolean;
  /** Area 3 only applicable for Interior Master */
  useArea3: boolean;
}

/**
 * Determine which areas (1, 2, 3) are applicable for a given class
 *
 * AKC Scent Work Rules:
 * - Area 1: Always used
 * - Area 2: Used for Interior Excellent, Interior Master, and Handler Discrimination Master
 * - Area 3: Only used for Interior Master
 *
 * @param element - Class element (e.g., "Interior", "Containers", "Handler Discrimination")
 * @param level - Class level (e.g., "Novice", "Excellent", "Master")
 * @returns Object indicating which areas are applicable
 *
 * @example
 * determineAreasForClass('Interior', 'Master')
 * // Returns: { useArea1: true, useArea2: true, useArea3: true }
 *
 * @example
 * determineAreasForClass('Interior', 'Excellent')
 * // Returns: { useArea1: true, useArea2: true, useArea3: false }
 *
 * @example
 * determineAreasForClass('Containers', 'Novice')
 * // Returns: { useArea1: true, useArea2: false, useArea3: false }
 */
export function determineAreasForClass(
  element: string,
  level: string
): AreaApplicability {
  // Normalize to lowercase for case-insensitive comparison
  const normalizedElement = element.toLowerCase();
  const normalizedLevel = level.toLowerCase();

  // Area 1 is always used
  const useArea1 = true;

  // Area 2 is for Interior Excellent, Interior Master, and Handler Discrimination Master
  const useArea2 =
    (normalizedElement === 'interior' &&
      (normalizedLevel === 'excellent' || normalizedLevel === 'master')) ||
    (normalizedElement === 'handler discrimination' && normalizedLevel === 'master');

  // Area 3 is only for Interior Master
  const useArea3 = normalizedElement === 'interior' && normalizedLevel === 'master';

  return {
    useArea1,
    useArea2,
    useArea3,
  };
}

/**
 * Get the count of applicable areas for a class
 *
 * @param element - Class element
 * @param level - Class level
 * @returns Number of applicable areas (1, 2, or 3)
 *
 * @example
 * getAreaCountForClass('Interior', 'Master') // 3
 * getAreaCountForClass('Interior', 'Excellent') // 2
 * getAreaCountForClass('Containers', 'Novice') // 1
 */
export function getAreaCountForClass(element: string, level: string): number {
  const areas = determineAreasForClass(element, level);
  let count = 0;
  if (areas.useArea1) count++;
  if (areas.useArea2) count++;
  if (areas.useArea3) count++;
  return count;
}
