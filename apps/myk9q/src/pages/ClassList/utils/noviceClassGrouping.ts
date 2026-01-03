/**
 * Sectioned Class Grouping Utilities
 *
 * Pure utility functions for grouping A/B section classes together.
 * - AKC Scent Work: Only Novice level has A/B sections
 * - UKC Nosework: ALL levels have A/B divisions
 *
 * Extracted from ClassList.tsx for better testability and reusability.
 */

import type { ClassEntry } from '../hooks/useClassListData';

/**
 * Check if the organization uses A/B sections for all levels
 * Currently only UKC Nosework uses divisions for all levels
 */
export function shouldCombineAllSections(organization: string | undefined): boolean {
  if (!organization) return false;
  const orgLower = organization.toLowerCase();
  return orgLower.includes('ukc') && orgLower.includes('nosework');
}

/**
 * Find the paired class for a given class entry with A/B sections
 *
 * Behavior depends on organization:
 * - UKC Nosework: ALL levels with A/B sections are paired
 * - AKC (default): Only Novice level classes are paired
 *
 * @param clickedClass - The class entry to find a pair for
 * @param allClasses - Complete list of all classes to search within
 * @param organization - Organization string (e.g., "UKC Nosework", "AKC Scent Work")
 * @returns The paired class entry, or null if no pair exists
 *
 * @example
 * ```typescript
 * // AKC: Only Novice classes are paired
 * const noviceA = { element: 'Interiors', level: 'Novice', section: 'A', ... };
 * const paired = findPairedSectionedClass(noviceA, classes, 'AKC Scent Work');
 *
 * // UKC: All levels are paired
 * const masterA = { element: 'Interiors', level: 'Master', section: 'A', ... };
 * const paired = findPairedSectionedClass(masterA, classes, 'UKC Nosework');
 * ```
 */
export function findPairedSectionedClass(
  clickedClass: ClassEntry,
  allClasses: ClassEntry[],
  organization?: string
): ClassEntry | null {
  // Check if class has a section that can be paired
  if (clickedClass.section !== 'A' && clickedClass.section !== 'B') {
    return null;
  }

  // Determine if we should combine based on organization
  const combineAll = shouldCombineAllSections(organization);

  // For AKC (default), only combine Novice level
  if (!combineAll && clickedClass.level !== 'Novice') {
    return null;
  }

  // Determine the paired section (A <-> B)
  const pairedSection = clickedClass.section === 'A' ? 'B' : 'A';

  // Find the matching class with same element, level, but different section
  const paired = allClasses.find(c =>
    c.element === clickedClass.element &&
    c.level === clickedClass.level &&
    c.section === pairedSection
  );

  return paired || null;
}

/**
 * @deprecated Use findPairedSectionedClass instead
 * Kept for backwards compatibility
 */
export function findPairedNoviceClass(
  clickedClass: ClassEntry,
  allClasses: ClassEntry[]
): ClassEntry | null {
  return findPairedSectionedClass(clickedClass, allClasses, undefined);
}

/**
 * Group sectioned A/B classes into combined entries
 *
 * Processes a list of classes and combines matching A/B pairs into
 * single "A & B" entries with aggregated data. This reduces visual clutter
 * and provides a unified view of related classes.
 *
 * **Combination rules depend on organization:**
 * - UKC Nosework: ALL levels with section 'A' or 'B' are combined
 * - AKC (default): Only Novice level classes are combined
 * - Classes must match on `element` and `level`
 * - Combined entry uses section 'A' as primary ID
 * - Entry counts, completion counts, and dog arrays are merged
 * - Favorite status is true if either class is favorited
 *
 * @param classList - Original list of class entries
 * @param organization - Organization string (e.g., "UKC Nosework", "AKC Scent Work")
 * @param findPaired - Optional custom function to find paired classes
 * @returns New array with A/B classes combined, other classes unchanged
 *
 * @example
 * ```typescript
 * // AKC: Only Novice classes are combined
 * const grouped = groupSectionedClasses(classes, 'AKC Scent Work');
 *
 * // UKC: All levels are combined
 * const grouped = groupSectionedClasses(classes, 'UKC Nosework');
 * ```
 */
export function groupSectionedClasses(
  classList: ClassEntry[],
  organization?: string,
  findPaired?: (classEntry: ClassEntry, allClasses: ClassEntry[]) => ClassEntry | null
): ClassEntry[] {
  // NOTE: Duplicate records are prevented at the storage layer (ReplicatedTableBatch.ts).
  // See cleanupDuplicateRecords() in DatabaseManager.ts for migration of legacy data.

  const combineAll = shouldCombineAllSections(organization);
  const grouped: ClassEntry[] = [];
  const processedIds = new Set<number>();

  // Default findPaired function if not provided
  const findPairedFn = findPaired || ((entry: ClassEntry, all: ClassEntry[]) =>
    findPairedSectionedClass(entry, all, organization)
  );

  for (const classEntry of classList) {
    // Skip if already processed as part of a pair
    if (processedIds.has(classEntry.id)) continue;

    // Check if this class has a section that can be paired
    const hasPairableSection = classEntry.section === 'A' || classEntry.section === 'B';
    // For AKC: only Novice; for UKC Nosework: all levels
    const shouldCheckForPair = hasPairableSection && (combineAll || classEntry.level === 'Novice');

    if (shouldCheckForPair) {
      // Find the paired class
      const paired = findPairedFn(classEntry, classList);

      if (paired) {
        // Mark both as processed
        processedIds.add(classEntry.id);
        processedIds.add(paired.id);

        // Determine which class comes first (use class_order or section)
        const first = classEntry.section === 'A' ? classEntry : paired;
        const second = classEntry.section === 'A' ? paired : classEntry;

        // Create combined entry
        const combined: ClassEntry = {
          ...first, // Use first class as base
          id: first.id, // Primary ID for navigation
          section: 'A & B', // Combined section label
          class_name: `${first.element} ${first.level} A & B`, // Combined name
          entry_count: first.entry_count + second.entry_count, // Sum entries
          completed_count: first.completed_count + second.completed_count, // Sum completed
          dogs: [...first.dogs, ...second.dogs], // Merge dogs array
          is_favorite: first.is_favorite || second.is_favorite, // Favorite if either is favorited
          // Store paired ID for navigation
          pairedClassId: second.id
        };

        grouped.push(combined);
      } else {
        // No pair found, add as-is
        grouped.push(classEntry);
      }
    } else {
      // Not a pairable class, add as-is
      grouped.push(classEntry);
    }
  }

  return grouped;
}

/**
 * @deprecated Use groupSectionedClasses instead
 * Kept for backwards compatibility
 */
export function groupNoviceClasses(
  classList: ClassEntry[],
  findPaired?: (classEntry: ClassEntry, allClasses: ClassEntry[]) => ClassEntry | null
): ClassEntry[] {
  return groupSectionedClasses(classList, undefined, findPaired);
}

/**
 * Check if a class entry is a combined A & B entry
 *
 * @param classEntry - The class entry to check
 * @returns True if this is a combined entry with section 'A & B'
 *
 * @example
 * ```typescript
 * const combined = { section: 'A & B', pairedClassId: 123, ... };
 * const single = { section: 'A', ... };
 *
 * isCombinedEntry(combined); // true
 * isCombinedEntry(single);   // false
 * ```
 */
export function isCombinedEntry(classEntry: ClassEntry): boolean {
  return classEntry.section === 'A & B' && !!classEntry.pairedClassId;
}

/**
 * @deprecated Use isCombinedEntry instead
 */
export function isCombinedNoviceEntry(classEntry: ClassEntry): boolean {
  return isCombinedEntry(classEntry);
}

/**
 * Get all class IDs from a potentially combined entry
 *
 * If the entry is a combined A & B class, returns both IDs.
 * Otherwise returns just the single class ID.
 *
 * @param classEntry - The class entry to extract IDs from
 * @returns Array of class IDs (length 1 for single, length 2 for combined)
 *
 * @example
 * ```typescript
 * const combined = { id: 1, pairedClassId: 2, section: 'A & B', ... };
 * const single = { id: 3, section: 'A', ... };
 *
 * getClassIds(combined); // [1, 2]
 * getClassIds(single);   // [3]
 * ```
 */
export function getClassIds(classEntry: ClassEntry): number[] {
  if (isCombinedEntry(classEntry)) {
    return [classEntry.id, classEntry.pairedClassId!];
  }
  return [classEntry.id];
}
