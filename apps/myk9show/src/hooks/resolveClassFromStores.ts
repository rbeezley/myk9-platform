import type { TrialClass } from '@/components/trials/types/trial.types';

/**
 * Find a class by id in the device stores: the React Query list first, then the replication
 * layer (`trialStore.trialClasses`, grouped by trial). The query is online-only and empty after
 * a cold offline reload, and classes the wizard just created exist in IndexedDB before they sync,
 * so the replicated fallback is what keeps a class that is on screen resolvable.
 */
export function resolveClassFromStores<TQueryClass extends { id: string }>(
  classId: string,
  queryClasses: readonly TQueryClass[],
  replicatedTrialClasses: Record<string, readonly TrialClass[]>
): TQueryClass | null {
  const fromQuery = queryClasses.find(cls => cls.id === classId);
  if (fromQuery) return fromQuery;
  for (const trialCls of Object.values(replicatedTrialClasses)) {
    const found = trialCls.find(cls => cls.id === classId);
    if (found) return found as unknown as TQueryClass;
  }
  return null;
}
