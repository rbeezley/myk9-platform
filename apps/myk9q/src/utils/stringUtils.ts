/**
 * String Utility Functions
 *
 * Pure utility functions for string manipulation, formatting, and transformation.
 * No dependencies on React or DOM APIs.
 */

/**
 * Build a formatted class name from element, level, and optional section
 *
 * Combines class element, level, and section into a standardized display format.
 * Section is only appended if present and not equal to '-' (placeholder value).
 *
 * @param element - Class element (e.g., "Containers", "Interior", "Handler Discrimination")
 * @param level - Class level (e.g., "Novice", "Excellent", "Master")
 * @param section - Optional section (e.g., "A", "B", null, "-")
 * @returns Formatted class name string
 *
 * @example
 * buildClassName("Containers", "Novice", "A")
 * // Returns: "Containers Novice A"
 *
 * @example
 * buildClassName("Interior", "Master", null)
 * // Returns: "Interior Master"
 *
 * @example
 * buildClassName("Buried", "Novice", "-")
 * // Returns: "Buried Novice" (ignores "-" placeholder)
 */
export function buildClassName(
  element: string,
  level: string,
  section?: string | null
): string {
  let className = `${element} ${level}`;

  // Only append section if it exists and is not a placeholder
  if (section && section !== '-') {
    className += ` ${section}`;
  }

  return className;
}
