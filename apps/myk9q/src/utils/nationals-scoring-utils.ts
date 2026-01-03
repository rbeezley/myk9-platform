/**
 * Nationals Scoring Utility Functions
 *
 * Extracted from AKCNationalsScoresheet.tsx
 * Pure utility functions for AKC Scent Work Master Nationals scoring.
 *
 * Features:
 * - Element type mapping (Container, Buried, Interior, Exterior, HD Challenge)
 * - Day determination helpers
 * - Nationals-specific formatting
 *
 * STATUS: Dormant (No current nationals scheduled)
 * LAST USED: 2024
 */

/**
 * Nationals element types matching database schema
 */
export type NationalsElementType =
  | 'CONTAINER'
  | 'BURIED'
  | 'INTERIOR'
  | 'EXTERIOR'
  | 'HD_CHALLENGE';

/**
 * Competition day (Day 1, 2, or 3)
 */
export type CompetitionDay = 1 | 2 | 3;

/**
 * Map scent work element name to Nationals database type
 *
 * Converts friendly element names (e.g., "Container Search", "Buried", "Interior")
 * to standardized database enum values.
 *
 * @param element - Element name (case-insensitive)
 * @returns Nationals element type for database storage
 *
 * @example
 * ```ts
 * mapElementToNationalsType('Container Search');
 * // Returns: 'CONTAINER'
 *
 * mapElementToNationalsType('Interior');
 * // Returns: 'INTERIOR'
 *
 * mapElementToNationalsType('Handler Discrimination');
 * // Returns: 'HD_CHALLENGE'
 *
 * mapElementToNationalsType('unknown');
 * // Returns: 'CONTAINER' (default)
 * ```
 */
export function mapElementToNationalsType(
  element: string
): NationalsElementType {
  const elementLower = element?.toLowerCase() || '';

  if (elementLower.includes('container')) return 'CONTAINER';
  if (elementLower.includes('buried')) return 'BURIED';
  if (elementLower.includes('interior')) return 'INTERIOR';
  if (elementLower.includes('exterior')) return 'EXTERIOR';
  if (
    elementLower.includes('handler') ||
    elementLower.includes('discrimination')
  ) {
    return 'HD_CHALLENGE';
  }

  return 'CONTAINER'; // Default fallback
}

/**
 * Get friendly display name for Nationals element type
 *
 * @param elementType - Database element type
 * @returns Human-readable element name
 *
 * @example
 * ```ts
 * getNationalsElementDisplayName('CONTAINER');
 * // Returns: 'Container'
 *
 * getNationalsElementDisplayName('HD_CHALLENGE');
 * // Returns: 'Handler Discrimination'
 * ```
 */
export function getNationalsElementDisplayName(
  elementType: NationalsElementType
): string {
  switch (elementType) {
    case 'CONTAINER':
      return 'Container';
    case 'BURIED':
      return 'Buried';
    case 'INTERIOR':
      return 'Interior';
    case 'EXTERIOR':
      return 'Exterior';
    case 'HD_CHALLENGE':
      return 'Handler Discrimination';
    default:
      return 'Unknown';
  }
}

/**
 * Get all valid Nationals element types
 *
 * @returns Array of all element types
 *
 * @example
 * ```ts
 * const types = getAllNationalsElementTypes();
 * // Returns: ['CONTAINER', 'BURIED', 'INTERIOR', 'EXTERIOR', 'HD_CHALLENGE']
 * ```
 */
export function getAllNationalsElementTypes(): NationalsElementType[] {
  return ['CONTAINER', 'BURIED', 'INTERIOR', 'EXTERIOR', 'HD_CHALLENGE'];
}

/**
 * Check if element type is valid for Nationals
 *
 * @param elementType - Element type to validate
 * @returns True if valid Nationals element type
 *
 * @example
 * ```ts
 * isValidNationalsElement('CONTAINER'); // true
 * isValidNationalsElement('ADVANCED');   // false
 * ```
 */
export function isValidNationalsElement(
  elementType: string
): elementType is NationalsElementType {
  return getAllNationalsElementTypes().includes(
    elementType as NationalsElementType
  );
}

/**
 * Get max time for Nationals element (in seconds)
 *
 * Different elements have different time limits at Nationals.
 *
 * @param elementType - Nationals element type
 * @returns Maximum time in seconds
 *
 * @example
 * ```ts
 * getNationalsMaxTime('CONTAINER'); // 120 (2:00)
 * getNationalsMaxTime('INTERIOR');  // 180 (3:00)
 * getNationalsMaxTime('EXTERIOR');  // 180 (3:00)
 * ```
 */
export function getNationalsMaxTime(elementType: NationalsElementType): number {
  switch (elementType) {
    case 'CONTAINER':
      return 120; // 2:00
    case 'INTERIOR':
    case 'EXTERIOR':
    case 'BURIED':
      return 180; // 3:00
    case 'HD_CHALLENGE':
      return 180; // 3:00
    default:
      return 120; // Default to 2:00
  }
}

/**
 * Get max time formatted as MM:SS
 *
 * @param elementType - Nationals element type
 * @returns Formatted time string (e.g., "2:00", "3:00")
 *
 * @example
 * ```ts
 * getNationalsMaxTimeFormatted('CONTAINER'); // "2:00"
 * getNationalsMaxTimeFormatted('INTERIOR');  // "3:00"
 * ```
 */
export function getNationalsMaxTimeFormatted(
  elementType: NationalsElementType
): string {
  const seconds = getNationalsMaxTime(elementType);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Validate competition day
 *
 * @param day - Day number to validate
 * @returns True if valid competition day (1, 2, or 3)
 *
 * @example
 * ```ts
 * isValidCompetitionDay(1); // true
 * isValidCompetitionDay(4); // false
 * ```
 */
export function isValidCompetitionDay(day: number): day is CompetitionDay {
  return day === 1 || day === 2 || day === 3;
}

/**
 * Get competition day display name
 *
 * @param day - Competition day (1, 2, or 3)
 * @returns Display name (e.g., "Day 1", "Day 2 Semifinals", "Day 3 Finals")
 *
 * @example
 * ```ts
 * getCompetitionDayName(1); // "Day 1"
 * getCompetitionDayName(2); // "Day 2 Semifinals"
 * getCompetitionDayName(3); // "Day 3 Finals"
 * ```
 */
export function getCompetitionDayName(day: CompetitionDay): string {
  switch (day) {
    case 1:
      return 'Day 1';
    case 2:
      return 'Day 2 Semifinals';
    case 3:
      return 'Day 3 Finals';
    default:
      return `Day ${day}`;
  }
}
