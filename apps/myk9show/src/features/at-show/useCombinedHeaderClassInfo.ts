import { useMemo } from 'react';
import type { ClassInfo } from '@myk9/ringside';
import { mergeSectionCancellation } from '@myk9/ringside/run-queue';
import { isCancelledClassStatus } from './ringsideClassStatusMap';
import { useClassInfoOnPaper } from './useClassInfoOnPaper';

/**
 * The class info the combined A/B header and list read (MYK9-1847, MYK9-1970).
 *
 * The header carries section A's status. Cancelled reads for the pair only when every section is
 * cancelled; with just A cancelled the header drops it rather than call B's dogs cancelled too.
 * Paper is section A's claim by the one rule (`useClassInfoOnPaper`), so a combined paper class
 * drops "Up next" and "Then" like a single one.
 */
export function useCombinedHeaderClassInfo(
  showId: string | undefined,
  classInfo: ClassInfo | null,
  classIdA: string | undefined,
  classIdB: string | undefined,
  isClassCancelled: (classId: string) => boolean
): ClassInfo | null {
  const withPaper = useClassInfoOnPaper(showId, classInfo);
  const allSectionsCancelled = mergeSectionCancellation(
    { section: 'A', is_cancelled: !!classIdA && isClassCancelled(classIdA) },
    { section: 'B', is_cancelled: !!classIdB && isClassCancelled(classIdB) }
  ).allCancelled;
  return useMemo(() => {
    if (!withPaper) return withPaper;
    if (allSectionsCancelled) return { ...withPaper, classStatus: 'cancelled' };
    if (!isCancelledClassStatus(withPaper.classStatus)) return withPaper;
    const withoutStatus = { ...withPaper };
    delete withoutStatus.classStatus;
    return withoutStatus;
  }, [withPaper, allSectionsCancelled]);
}
