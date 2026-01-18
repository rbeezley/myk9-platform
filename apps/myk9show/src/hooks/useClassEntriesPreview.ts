import { useMemo } from 'react';
import { useEntryStore } from '@/store/entryStore';
import type { ClassCardEntry } from '@myk9/ui';

/**
 * Entry preview data for a class
 */
export interface ClassEntryPreview {
  classId: string;
  entries: ClassCardEntry[];
}

/**
 * Hook to get entry preview data for ClassCard components.
 * Transforms entry store data to the ClassCardEntry format needed by @myk9/ui ClassCard.
 *
 * @param classIds - Array of class IDs to get entry previews for
 * @returns Map of classId to ClassCardEntry array
 */
export function useClassEntriesPreview(classIds: string[]): Map<string, ClassCardEntry[]> {
  const allEntries = useEntryStore((state) => state.entries);

  return useMemo(() => {
    const previewMap = new Map<string, ClassCardEntry[]>();

    for (const classId of classIds) {
      // Get entries for this class
      const classEntries = allEntries.filter((entry) => entry.classId === classId);

      // Transform to ClassCardEntry format
      // Sort by run order, then by armband
      const sortedEntries = [...classEntries].sort((a, b) => {
        const orderA = a.registrationData.runOrder ?? 999;
        const orderB = b.registrationData.runOrder ?? 999;
        if (orderA !== orderB) return orderA - orderB;

        const armbandA = parseInt(a.registrationData.armband || '0', 10);
        const armbandB = parseInt(b.registrationData.armband || '0', 10);
        return armbandA - armbandB;
      });

      const cardEntries: ClassCardEntry[] = sortedEntries.map((entry) => ({
        id: entry.id,
        armband: parseInt(entry.registrationData.armband || '0', 10),
        inRing: entry.status === 'competing',
        isScored: entry.status === 'completed',
      }));

      // Filter to show in-ring + next 3 unscored entries (like myK9Q)
      const inRingEntry = cardEntries.find((e) => e.inRing);
      const unscoredEntries = cardEntries.filter((e) => !e.isScored && !e.inRing);
      const previewEntries: ClassCardEntry[] = [];

      if (inRingEntry) {
        previewEntries.push(inRingEntry);
      }

      // Add next 3 unscored entries
      previewEntries.push(...unscoredEntries.slice(0, 3));

      previewMap.set(classId, previewEntries);
    }

    return previewMap;
  }, [classIds, allEntries]);
}

/**
 * Hook to get entry preview for a single class
 *
 * @param classId - Class ID to get entry preview for
 * @returns Array of ClassCardEntry for preview
 */
export function useClassEntryPreview(classId: string): ClassCardEntry[] {
  const previewMap = useClassEntriesPreview([classId]);
  return previewMap.get(classId) || [];
}
