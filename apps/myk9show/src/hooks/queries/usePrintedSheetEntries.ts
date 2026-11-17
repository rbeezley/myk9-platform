import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getEntriesByShowFromReplication } from '@/services/database/entries';
import {
  getHandlerPeopleHydrationRevision,
  subscribeHandlerPeopleHydration,
} from '@/services/database/entries/handlerHydration';
import {
  replicatedClassesTable,
  replicatedDogRegistrationsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { cacheStrategies, queryKeys } from '@/lib/queryClient';
import type { ReportDbEntry } from '@/lib/reports/types';
import { attachDogRegistrations } from './attachDogRegistrations';

function subscribeToHandlerPeopleRevision(onStoreChange: () => void): () => void {
  return subscribeHandlerPeopleHydration(() => onStoreChange());
}

/**
 * The show's entries as the printed sheets (check-in sheet, scoresheet) read them: the same
 * replica reader Reports uses plus the same registration join, so the class card's "changed since
 * printing" fingerprint and the PDF are built from one set of rows (MYK9-2103).
 *
 * Invalidates on the tables Reports' `useReportData` watches (trials, classes, entries, dogs) and
 * on handler-person hydration, plus the replicated dog registrations, which supply the number the
 * scoresheet prints. `networkMode: 'always'` so a cold offline load still reads the device copy.
 */
export function usePrintedSheetEntries(showId: string) {
  const queryClient = useQueryClient();
  const handlerPeopleRevision = useSyncExternalStore(
    subscribeToHandlerPeopleRevision,
    getHandlerPeopleHydrationRevision,
    getHandlerPeopleHydrationRevision
  );
  const previousRevision = useRef(handlerPeopleRevision);
  const queryKey = queryKeys.printedSheetEntries(showId);

  useEffect(() => {
    if (!showId) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.printedSheetEntries(showId) });
    };
    const unsubscribes = [
      replicatedTrialsTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedClassesTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedEntriesTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedDogsTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedDogRegistrationsTable.subscribe(invalidate, { emitCurrent: false }),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [queryClient, showId]);

  useEffect(() => {
    if (previousRevision.current === handlerPeopleRevision) return;
    previousRevision.current = handlerPeopleRevision;
    if (showId) void queryClient.invalidateQueries({ queryKey });
  }, [handlerPeopleRevision, queryClient, queryKey, showId]);

  return useQuery({
    queryKey,
    queryFn: async (): Promise<{
      entries: ReportDbEntry[];
      registrationsReadComplete: boolean;
    }> => {
      const { data, error } = await getEntriesByShowFromReplication(showId);
      if (error) throw error;
      return attachDogRegistrations((data ?? []) as ReportDbEntry[]);
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
    networkMode: 'always',
  });
}
