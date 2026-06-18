import { useQuery } from '@tanstack/react-query';
import { getPublicClassById } from '@/services/database/classes';
import { cacheStrategies } from '@/lib/queryClient';

/**
 * Cold-session fallback for a class record.
 *
 * `ClassDetailsPage` normally sources `currentClass` from the replication layer (synced
 * classes + trialStore). For a true guest that store is cold-empty, so the page would dead-end
 * on the public `/results` route. This hook reads the class directly via PostgREST
 * (`getPublicClassById`, anon-safe — class + trial only, no PII), and is meant to be enabled
 * **only** when the replicated class is missing, so warm/authed sessions never pay for it.
 *
 * Mirrors the anon-vs-authed split already used by `useClassEntriesRaw`.
 */
export function usePublicClassById(
  classId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['public-class', classId],
    queryFn: () => getPublicClassById(classId as string),
    enabled: (options?.enabled ?? true) && !!classId,
    ...cacheStrategies.dynamic,
  });
}
