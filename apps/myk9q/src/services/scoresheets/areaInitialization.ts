/**
 * Area Initialization Utilities for Scent Work Scoresheets
 *
 * Pure utility functions for initializing search areas based on element and level.
 * Extracted from AKCScentWorkScoresheet-Enhanced.tsx for better testability.
 *
 * Handles both regular shows and Nationals mode with different area configurations.
 */

/**
 * Represents a single search area in scent work scoring
 */
export interface AreaScore {
  areaName: string;
  time: string;
  found: boolean;
  correct: boolean;
}

/**
 * Options for area initialization
 */
export interface InitializeAreasOptions {
  /** Whether this is a Nationals event (default: false) */
  isNationalsMode?: boolean;
  /**
   * Override the area count (used for ASCA where judges can choose 1 or 2 areas).
   * If provided, this takes precedence over the element/level-based calculation.
   */
  areaCountOverride?: number;
}

/**
 * Initialize search areas based on element, level, and show type
 *
 * **Regular Show Mode (AKC):**
 * - **Interior**:
 *   - Novice/Advanced: 1 area
 *   - Excellent: 2 areas
 *   - Master: 3 areas
 * - **Handler Discrimination**:
 *   - Novice/Advanced/Excellent: 1 area
 *   - Master: 2 areas
 * - **Container/Exterior/Buried**: 1 area (all levels)
 *
 * **ASCA Interior Advanced/Excellent:**
 * - Area count is judge's choice (1 or 2), passed via areaCountOverride
 *
 * **Nationals Mode:**
 * - **All elements**: 1 area (except Handler Discrimination)
 * - **Handler Discrimination**: Follows regular show rules
 *
 * @param element - The scent work element (e.g., 'Interior', 'Container')
 * @param level - The class level (e.g., 'Novice', 'Excellent', 'Master')
 * @param isNationalsModeOrOptions - Boolean for backwards compatibility, or options object
 * @returns Array of initialized area scores
 *
 * @example
 * ```typescript
 * // Regular show - Interior Novice
 * initializeAreas('Interior', 'Novice', false)
 * // Returns: [{ areaName: 'Interior', time: '', found: false, correct: false }]
 *
 * // Regular show - Interior Excellent
 * initializeAreas('Interior', 'Excellent', false)
 * // Returns: [
 * //   { areaName: 'Interior Area 1', time: '', found: false, correct: false },
 * //   { areaName: 'Interior Area 2', time: '', found: false, correct: false }
 * // ]
 *
 * // ASCA Interior Advanced with 2 areas (judge's choice)
 * initializeAreas('Interior', 'Advanced', { areaCountOverride: 2 })
 * // Returns: [
 * //   { areaName: 'Interior Area 1', time: '', found: false, correct: false },
 * //   { areaName: 'Interior Area 2', time: '', found: false, correct: false }
 * // ]
 *
 * // Regular show - Interior Master
 * initializeAreas('Interior', 'Master', false)
 * // Returns: [
 * //   { areaName: 'Interior Area 1', time: '', found: false, correct: false },
 * //   { areaName: 'Interior Area 2', time: '', found: false, correct: false },
 * //   { areaName: 'Interior Area 3', time: '', found: false, correct: false }
 * // ]
 *
 * // Regular show - Handler Discrimination Master
 * initializeAreas('Handler Discrimination', 'Master', false)
 * // Returns: [
 * //   { areaName: 'Handler Discrimination Area 1', time: '', found: false, correct: false },
 * //   { areaName: 'Handler Discrimination Area 2', time: '', found: false, correct: false }
 * // ]
 *
 * // Nationals mode - Interior Master
 * initializeAreas('Interior', 'Master', true)
 * // Returns: [{ areaName: 'Interior', time: '', found: false, correct: false }]
 *
 * // Nationals mode - Handler Discrimination Master (exception)
 * initializeAreas('Handler Discrimination', 'Master', true)
 * // Returns: [
 * //   { areaName: 'Handler Discrimination Area 1', time: '', found: false, correct: false },
 * //   { areaName: 'Handler Discrimination Area 2', time: '', found: false, correct: false }
 * // ]
 * ```
 */
export function initializeAreas(
  element: string,
  level: string,
  isNationalsModeOrOptions: boolean | InitializeAreasOptions = false
): AreaScore[] {
  // Handle backwards compatibility - accept boolean or options object
  const options: InitializeAreasOptions = typeof isNationalsModeOrOptions === 'boolean'
    ? { isNationalsMode: isNationalsModeOrOptions }
    : isNationalsModeOrOptions;

  const { isNationalsMode = false, areaCountOverride } = options;
  const elementLower = element?.toLowerCase() || '';
  const levelLower = level?.toLowerCase() || '';

  // For nationals mode, everything except Handler Discrimination has single area
  if (isNationalsMode) {
    if (elementLower === 'handler discrimination' || elementLower === 'handlerdiscrimination') {
      // Handler Discrimination in nationals still follows regular rules
      if (levelLower === 'master' || levelLower === 'masters') {
        return [
          { areaName: 'Handler Discrimination Area 1', time: '', found: false, correct: false },
          { areaName: 'Handler Discrimination Area 2', time: '', found: false, correct: false }
        ];
      } else {
        return [
          { areaName: 'Handler Discrimination', time: '', found: false, correct: false }
        ];
      }
    } else {
      // All other elements in nationals have single area regardless of level
      return [
        { areaName: element || 'Search Area', time: '', found: false, correct: false }
      ];
    }
  }

  // Handle areaCountOverride (used for ASCA where judge chooses area count)
  if (areaCountOverride !== undefined && areaCountOverride > 0) {
    const displayElement = element || 'Search Area';
    if (areaCountOverride === 1) {
      return [
        { areaName: displayElement, time: '', found: false, correct: false }
      ];
    }
    // Generate numbered areas for count > 1
    return Array.from({ length: areaCountOverride }, (_, i) => ({
      areaName: `${displayElement} Area ${i + 1}`,
      time: '',
      found: false,
      correct: false
    }));
  }

  // Regular show logic (non-nationals) - AKC rules
  if (elementLower === 'interior') {
    if (levelLower === 'excellent') {
      return [
        { areaName: 'Interior Area 1', time: '', found: false, correct: false },
        { areaName: 'Interior Area 2', time: '', found: false, correct: false }
      ];
    } else if (levelLower === 'master' || levelLower === 'masters') {
      return [
        { areaName: 'Interior Area 1', time: '', found: false, correct: false },
        { areaName: 'Interior Area 2', time: '', found: false, correct: false },
        { areaName: 'Interior Area 3', time: '', found: false, correct: false }
      ];
    } else {
      return [
        { areaName: 'Interior', time: '', found: false, correct: false }
      ];
    }
  } else if (elementLower === 'handler discrimination' || elementLower === 'handlerdiscrimination') {
    if (levelLower === 'master' || levelLower === 'masters') {
      return [
        { areaName: 'Handler Discrimination Area 1', time: '', found: false, correct: false },
        { areaName: 'Handler Discrimination Area 2', time: '', found: false, correct: false }
      ];
    } else {
      return [
        { areaName: 'Handler Discrimination', time: '', found: false, correct: false }
      ];
    }
  } else {
    // Container, Exterior, Buried - single area for all levels in regular shows
    return [
      { areaName: element || 'Search Area', time: '', found: false, correct: false }
    ];
  }
}

/**
 * Get the expected number of areas for a given element and level
 *
 * Useful for validation and UI display logic.
 *
 * @param element - The scent work element
 * @param level - The class level
 * @param isNationalsMode - Whether this is a Nationals event (default: false)
 * @returns Expected number of search areas
 *
 * @example
 * ```typescript
 * getExpectedAreaCount('Interior', 'Novice', false)    // 1
 * getExpectedAreaCount('Interior', 'Excellent', false) // 2
 * getExpectedAreaCount('Interior', 'Master', false)    // 3
 * getExpectedAreaCount('Interior', 'Master', true)     // 1 (Nationals)
 * getExpectedAreaCount('Container', 'Master', false)   // 1
 * ```
 */
export function getExpectedAreaCount(
  element: string,
  level: string,
  isNationalsMode: boolean = false
): number {
  return initializeAreas(element, level, isNationalsMode).length;
}

/**
 * Check if an element/level combination requires multiple areas
 *
 * @param element - The scent work element
 * @param level - The class level
 * @param isNationalsMode - Whether this is a Nationals event (default: false)
 * @returns True if multiple areas are required
 *
 * @example
 * ```typescript
 * hasMultipleAreas('Interior', 'Excellent', false)  // true
 * hasMultipleAreas('Interior', 'Master', false)     // true
 * hasMultipleAreas('Interior', 'Novice', false)     // false
 * hasMultipleAreas('Interior', 'Master', true)      // false (Nationals)
 * hasMultipleAreas('Container', 'Master', false)    // false
 * ```
 */
export function hasMultipleAreas(
  element: string,
  level: string,
  isNationalsMode: boolean = false
): boolean {
  return getExpectedAreaCount(element, level, isNationalsMode) > 1;
}

/**
 * Get area names for a given element and level
 *
 * @param element - The scent work element
 * @param level - The class level
 * @param isNationalsMode - Whether this is a Nationals event (default: false)
 * @returns Array of area names
 *
 * @example
 * ```typescript
 * getAreaNames('Interior', 'Master', false)
 * // ['Interior Area 1', 'Interior Area 2', 'Interior Area 3']
 *
 * getAreaNames('Container', 'Excellent', false)
 * // ['Container']
 *
 * getAreaNames('Handler Discrimination', 'Master', false)
 * // ['Handler Discrimination Area 1', 'Handler Discrimination Area 2']
 * ```
 */
export function getAreaNames(
  element: string,
  level: string,
  isNationalsMode: boolean = false
): string[] {
  return initializeAreas(element, level, isNationalsMode).map(area => area.areaName);
}

/**
 * Validate that area scores match the expected configuration
 *
 * Checks if the provided areas match what should be initialized for the element/level.
 *
 * @param areas - Current area scores
 * @param element - The scent work element
 * @param level - The class level
 * @param isNationalsMode - Whether this is a Nationals event (default: false)
 * @returns True if areas match expected configuration
 *
 * @example
 * ```typescript
 * const areas = [
 *   { areaName: 'Interior Area 1', time: '00:45.32', found: true, correct: true },
 *   { areaName: 'Interior Area 2', time: '00:52.10', found: true, correct: true }
 * ];
 *
 * validateAreas(areas, 'Interior', 'Excellent', false)  // true
 * validateAreas(areas, 'Interior', 'Master', false)     // false (needs 3 areas)
 * validateAreas(areas, 'Container', 'Excellent', false) // false (needs 1 area)
 * ```
 */
export function validateAreas(
  areas: AreaScore[],
  element: string,
  level: string,
  isNationalsMode: boolean = false
): boolean {
  const expectedAreas = initializeAreas(element, level, isNationalsMode);

  if (areas.length !== expectedAreas.length) {
    return false;
  }

  return areas.every((area, index) => area.areaName === expectedAreas[index].areaName);
}
