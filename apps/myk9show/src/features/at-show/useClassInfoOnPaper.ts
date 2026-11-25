import { useMemo } from 'react';
import type { ClassInfo } from '@myk9/ringside';
import { usePaperClaims } from './usePaperClaims';

/**
 * MYK9-1970: the class info with the paper claim resolved by the one rule (`usePaperClaims`).
 * `paperClaim` is 'paper' for a paper class and 'unknown' until the rows load; either withholds
 * the "Up next" / now-and-next layout. Absent means known phone-scored.
 */
export function useClassInfoOnPaper(
  showId: string | undefined,
  classInfo: ClassInfo | null
): ClassInfo | null {
  const { claimOf } = usePaperClaims([showId]);
  const classId = classInfo?.actualClassId;
  const claim = claimOf(classId);
  return useMemo(() => {
    if (!classInfo || claim === 'not-paper') return classInfo;
    return { ...classInfo, paperClaim: claim };
  }, [classInfo, claim]);
}
