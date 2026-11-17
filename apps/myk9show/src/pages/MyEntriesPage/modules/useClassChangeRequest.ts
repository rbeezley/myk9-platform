/**
 * The waiting request on one My Shows class row: the class asked for and why.
 *
 * Read online, straight from the server (see `classChangeRequests.ts`): the
 * replica's entry rows do not carry the target class or reason. Offline the
 * row still says "Change requested" from the replicated status, and just does
 * not name the class.
 *
 * @module MyEntriesPage/modules/useClassChangeRequest
 */

import { useQuery } from '@tanstack/react-query';
import {
  getClassChangeRequestDetails,
  getClassNamesByIds,
  classChangeReasonLabel,
} from '@/services/database/entries/classChangeRequests';

export interface ClassChangeRequestLine {
  targetClassName: string | null;
  reasonLabel: string | null;
}

export function useClassChangeRequest(
  entryId: string,
  enabled: boolean
): ClassChangeRequestLine | null {
  const { data } = useQuery({
    queryKey: ['class-change-request', entryId],
    enabled,
    queryFn: async (): Promise<ClassChangeRequestLine> => {
      const details = (await getClassChangeRequestDetails([entryId]))[entryId];
      const targetId = details?.targetClassId ?? null;
      const names = targetId ? await getClassNamesByIds([targetId]) : {};
      return {
        targetClassName: targetId ? (names[targetId] ?? null) : null,
        reasonLabel: classChangeReasonLabel(details?.reason),
      };
    },
  });
  return data ?? null;
}
