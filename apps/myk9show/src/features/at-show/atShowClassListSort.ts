/**
 * Scan ordering for the at-show class picker.
 *
 * Two different orders, because two different questions are being asked. The
 * full picker answers "what is happening at this show" (favorites, then live
 * rings, then classes with entries). The pinned "Your ring" section answers
 * "where do I go next", so it leads with whatever is live for THIS judge and
 * never surfaces a favorite that is not theirs.
 *
 * Pure functions, extracted from AtShowClassListPage so the ordering can be
 * tested without mounting the page.
 */
import { getEffectiveClassStatus, type ClassEntry } from '@myk9/ringside';

const LIVE_CLASS_STATUSES = new Set<ClassEntry['class_status']>([
  'briefing',
  'start_time',
  'in_progress',
  'offline-scoring',
]);

/**
 * Deliberately built from STATIC facts only -- favorite, then live status.
 *
 * `entry_count > 0` used to rank a class above an empty one. That was harmless
 * only while the counts never arrived at all: before MYK9-637 the entries
 * replica on this route was permanently cold, so every class scored the same
 * and the order was fixed at first paint by accident. Now that the show's
 * entries land a second or two after paint, the same rule would re-sort the
 * picker under a judge's finger on venue wifi. A list that reorders itself
 * while it is being tapped is worse than a list ordered slightly less usefully,
 * so the count is not an input here.
 */
export function classScanPriority(entry: ClassEntry): number {
  if (entry.is_favorite) return 0;
  if (LIVE_CLASS_STATUSES.has(entry.class_status)) return 1;
  return 2;
}

export function sortClassesForAtShowScan(classes: ClassEntry[]): ClassEntry[] {
  return [...classes].sort((a, b) => {
    const priorityDelta = classScanPriority(a) - classScanPriority(b);
    if (priorityDelta !== 0) return priorityDelta;
    const orderDelta = a.class_order - b.class_order;
    if (orderDelta !== 0) return orderDelta;
    return a.class_name.localeCompare(b.class_name);
  });
}

/** Static-only for the same reason as `classScanPriority` above. */
export function yourRingScanPriority(entry: ClassEntry): number {
  const effectiveStatus = getEffectiveClassStatus(entry);
  if (
    effectiveStatus === 'briefing' ||
    effectiveStatus === 'start_time' ||
    effectiveStatus === 'in-progress' ||
    effectiveStatus === 'offline-scoring'
  ) {
    return 0;
  }
  return 1;
}

export interface YourRingClass {
  entry: ClassEntry;
  scanPriority: number;
  trialTimeZone: string;
}

export function sortClassesForYourRing(classes: YourRingClass[]): YourRingClass[] {
  return [...classes].sort((a, b) => {
    const priorityDelta = a.scanPriority - b.scanPriority;
    if (priorityDelta !== 0) return priorityDelta;
    const orderDelta = a.entry.class_order - b.entry.class_order;
    if (orderDelta !== 0) return orderDelta;
    return a.entry.class_name.localeCompare(b.entry.class_name);
  });
}
