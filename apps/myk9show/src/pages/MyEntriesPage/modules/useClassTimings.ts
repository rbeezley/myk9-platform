import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { replicatedClassesTable } from '@/services/replication';
import { classTimingOf, type ClassTiming } from './buildYourDogsToday';

const NO_TIMINGS: ReadonlyMap<string, ClassTiming> = new Map();

export interface ClassTimingTarget {
  classId: string;
  timeZone: string;
}

/**
 * Posted start times for the given classes, read from the replicated classes
 * table (offline-safe; no network). A class the replica does not hold yet is
 * simply absent: the list then orders it last rather than inventing a time.
 */
export function useClassTimings(
  targets: readonly ClassTimingTarget[]
): ReadonlyMap<string, ClassTiming> {
  const queryClient = useQueryClient();
  const key = useMemo(
    () => [...new Set(targets.map(t => `${t.classId}@${t.timeZone}`))].sort().join(','),
    [targets]
  );

  useEffect(() => {
    if (!key) return;
    return replicatedClassesTable.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ['my-shows', 'class-timings', key] });
    });
  }, [key, queryClient]);

  const query = useQuery({
    queryKey: ['my-shows', 'class-timings', key] as const,
    queryFn: async () => {
      const timings = new Map<string, ClassTiming>();
      await Promise.all(
        targets.map(async ({ classId, timeZone }) => {
          const cls = await replicatedClassesTable.getClassById(classId);
          const timing = cls
            ? classTimingOf(cls.startTime, cls.revisedExpectedStart, timeZone)
            : null;
          if (timing) timings.set(classId, timing);
        })
      );
      return timings;
    },
    enabled: key !== '',
    // Reads IndexedDB; the default "online" mode would pause it offline.
    networkMode: 'always',
  });

  return query.data ?? NO_TIMINGS;
}
