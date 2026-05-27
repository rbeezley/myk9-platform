import type { ClassEntry, SortOrder } from './types';
import { getClassDisplayStatus } from '../../utils/classStatus';
import { getLevelSortOrder } from '../../utils/levelSort';

/** Check if max times are set for a class */
export function isMaxTimeSet(classEntry: ClassEntry): boolean {
  const { time_limit_seconds, time_limit_area2_seconds, time_limit_area3_seconds } = classEntry;

  const hasTime1 = Boolean(time_limit_seconds && time_limit_seconds > 0);
  const hasTime2 = Boolean(time_limit_area2_seconds && time_limit_area2_seconds > 0);
  const hasTime3 = Boolean(time_limit_area3_seconds && time_limit_area3_seconds > 0);

  return hasTime1 || hasTime2 || hasTime3;
}

/** Check if user role should see max time warning */
export function shouldShowMaxTimeWarning(): boolean {
  // For now, disable max time warnings to allow navigation
  return false;
}

/** Check if a fetch error represents empty data rather than a real error */
export function isEmptyDataError(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message?.toLowerCase() || '';
  return msg.includes('could not find') || msg.includes('no rows') || msg.includes('not found');
}

/** Filter classes by combined filter (pending/favorites/completed) and search term */
export function filterClasses(
  classes: ClassEntry[],
  combinedFilter: 'pending' | 'in-progress' | 'favorites' | 'completed',
  searchTerm: string
): ClassEntry[] {
  return classes.filter(classEntry => {
    const displayStatus = getClassDisplayStatus(classEntry);
    const isCompleted = displayStatus === 'completed';

    // Combined filter logic
    if (combinedFilter === 'pending' && isCompleted) return false;
    if (combinedFilter === 'in-progress' && displayStatus !== 'in-progress') return false;
    if (combinedFilter === 'completed' && !isCompleted) return false;
    if (combinedFilter === 'favorites' && !classEntry.is_favorite) return false;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesClassName = classEntry.class_name.toLowerCase().includes(searchLower);
      const matchesElement = classEntry.element.toLowerCase().includes(searchLower);
      const matchesLevel = classEntry.level.toLowerCase().includes(searchLower);
      const matchesJudge = classEntry.judge_name.toLowerCase().includes(searchLower);
      const matchesSection =
        classEntry.section && classEntry.section !== '-'
          ? classEntry.section.toLowerCase().includes(searchLower)
          : false;

      if (
        !matchesClassName &&
        !matchesElement &&
        !matchesLevel &&
        !matchesJudge &&
        !matchesSection
      ) {
        return false;
      }
    }

    return true;
  });
}

/** Sort classes by the given sort order */
export function sortClasses(classes: ClassEntry[], sortOrder: SortOrder): ClassEntry[] {
  const sorted = [...classes];

  sorted.sort((a, b) => {
    switch (sortOrder) {
      case 'class_order': {
        // Default: class_order, then element, then level, then section
        if (a.class_order !== b.class_order) {
          return a.class_order - b.class_order;
        }
        if (a.element !== b.element) {
          return a.element.localeCompare(b.element);
        }
        if (a.level !== b.level) {
          const levelOrder = { novice: 1, advanced: 2, excellent: 3, master: 4, masters: 4 };
          const aLevelOrder = levelOrder[a.level.toLowerCase() as keyof typeof levelOrder] || 999;
          const bLevelOrder = levelOrder[b.level.toLowerCase() as keyof typeof levelOrder] || 999;
          if (aLevelOrder !== bLevelOrder) {
            return aLevelOrder - bLevelOrder;
          }
          return a.level.localeCompare(b.level);
        }
        return a.section.localeCompare(b.section);
      }

      case 'element_level': {
        // Sort by element first, then level (standard progression)
        if (a.element !== b.element) {
          return a.element.localeCompare(b.element);
        }
        if (a.level !== b.level) {
          const aLevelOrder = getLevelSortOrder(a.level);
          const bLevelOrder = getLevelSortOrder(b.level);
          if (aLevelOrder !== bLevelOrder) {
            return aLevelOrder - bLevelOrder;
          }
          return a.level.localeCompare(b.level);
        }
        return a.section.localeCompare(b.section);
      }

      case 'level_element': {
        // Sort by level first (standard progression), then element
        if (a.level !== b.level) {
          const aLevelOrder = getLevelSortOrder(a.level);
          const bLevelOrder = getLevelSortOrder(b.level);
          if (aLevelOrder !== bLevelOrder) {
            return aLevelOrder - bLevelOrder;
          }
          return a.level.localeCompare(b.level);
        }
        if (a.element !== b.element) {
          return a.element.localeCompare(b.element);
        }
        return a.section.localeCompare(b.section);
      }

      default:
        return 0;
    }
  });

  return sorted;
}
