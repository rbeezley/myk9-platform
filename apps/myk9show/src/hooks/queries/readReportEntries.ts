import { onlineManager } from '@tanstack/react-query';
import {
  getEntriesByClass,
  getEntriesByShowFromReplication,
  getEntriesByTrial,
} from '@/services/database/entries';
import { refreshShowEntriesForRead } from '@/services/database/entries/refreshShowEntriesForRead';
import { getHandlerPeopleHydrationRevision } from '@/services/database/entries/handlerHydration';
import type { ReportDbEntry } from '@/lib/reports/types';
import { hydrateReportEntries, type HydratedReportEntries } from './reportEntryHydration';

export interface ReadReportEntriesScope {
  showId: string;
  trialId: string | 'all';
  classId: string | 'all';
  /**
   * True when a replica notice asked for this read: the replica already holds the change, and
   * the bounded network refresh would itself write rows and notify again, forever.
   */
  replicaNoticed: boolean;
}

/**
 * THE entry read behind Reports and the class card's printed-sheet fingerprint (MYK9-2103):
 * the scoped replica read, then `hydrateReportEntries`, replayed while handler people finish
 * hydrating mid-read (React Query can ignore an invalidation while the first fetch has no
 * cached data yet). One function, so the card and the PDF cannot disagree.
 */
export async function readReportEntries(
  scope: ReadReportEntriesScope
): Promise<HydratedReportEntries> {
  const { showId, trialId, classId, replicaNoticed } = scope;
  const readEntries = async (): Promise<HydratedReportEntries> => {
    if (classId !== 'all') {
      const { data, error } = await getEntriesByClass(classId);
      if (error) throw error;
      return hydrateReportEntries((data ?? []) as ReportDbEntry[]);
    }
    // Staff reports use the same replication-backed scoped reads as class
    // reports. The exhibitor show read resolves release visibility online and
    // must mask raw cached scores when that optional request is unavailable.
    // Retain the bounded refresh that show reports used before selecting
    // scoped reads, so an online partial cache still has a chance to fill.
    // Skipped when a replica notice asked for this read and offline, where it
    // can only fail -- or stall for its full deadline -- while Print waits on it.
    if (!replicaNoticed && onlineManager.isOnline()) await refreshShowEntriesForRead(showId);
    if (trialId === 'all') {
      const { data, error } = await getEntriesByShowFromReplication(showId);
      if (error) throw error;
      return hydrateReportEntries((data ?? []) as ReportDbEntry[]);
    }
    const { data, error } = await getEntriesByTrial(trialId);
    if (error) throw error;
    return hydrateReportEntries((data ?? []) as ReportDbEntry[]);
  };

  let revision = getHandlerPeopleHydrationRevision();
  let data = await readEntries();
  // If people completed during that fetch, replay the scoped read now; the authoritative person
  // rows are already persisted locally.
  while (getHandlerPeopleHydrationRevision() > revision) {
    revision = getHandlerPeopleHydrationRevision();
    data = await readEntries();
  }
  return data;
}
