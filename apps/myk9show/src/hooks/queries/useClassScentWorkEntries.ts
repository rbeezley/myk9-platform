/**
 * useClassScentWorkEntries
 *
 * Concentrates the entry data-source merge + transform logic that previously
 * lived inline in SecretaryClassDashboard. Combines:
 *   1. Database entries (React Query, via useClassEntriesWithQuery)
 *   2. Local Zustand entries (via useEntriesByClass)
 *   3. Dog lookup (via useDogStoreCompat)
 *
 * Local entries take priority and are emitted first; DB-only entries (not yet
 * in the local store) are appended afterwards. Both shapes are transformed
 * into the unified `ScentWorkEntry` representation consumed by the secretary
 * UI surfaces (dashboard, PlacementCalculator, ResultsGrid, BulkResultEntry).
 *
 * The order — local first, then DB-only fallbacks — is load-bearing: the
 * dashboard relies on it for entry list ordering. Do not change it without
 * updating downstream consumers.
 */

import { useMemo } from 'react';

import { useClassEntriesWithQuery } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useEntriesByClass } from '@/hooks/useFilteredEntries';
import type { CompetitionData } from '@/store/entryStore';
import type { Dog } from '@/types/dog-types';
import type { ShowEntry } from '@/types/entry-lifecycle';
import type {
  QualificationStatus,
  ScentWorkClassConfig,
  ScentWorkEntry,
} from '@/types/scent-work-types';

export interface UseClassScentWorkEntriesResult {
  entries: ScentWorkEntry[];
  isLoading: boolean;
  error: Error | null;
  dbCount: number;
  localCount: number;
}

/**
 * Build a ScentWorkEntry from a local ShowEntry, using dogsById for dog/breed
 * lookup and registrationData/competitionData for the rest of the display shape.
 */
function buildScentWorkEntryFromLocal(
  entry: ShowEntry,
  classConfig: ScentWorkClassConfig,
  classId: string,
  dogsById: Map<string, Dog>
): ScentWorkEntry {
  const dog = dogsById.get(entry.dogId);
  const registrationData = (entry.registrationData || {}) as Record<string, unknown>;
  const competitionData = (entry.competitionData || {}) as CompetitionData;

  const hasResult = Boolean(competitionData.score || competitionData.time);

  return {
    ...entry,
    classConfig,
    displayInfo: {
      armband: (registrationData.armband as string) || '',
      dogName: dog?.callName || dog?.name || 'Unknown Dog',
      dogBreed: dog?.registrations?.[0]?.breed || 'Unknown Breed',
      handlerName: (registrationData.handler as string) || 'Unknown Handler',
      dogId: entry.dogId || '',
      handlerId: (registrationData.handlerId as string) || '',
    },
    judgingState: {
      isInProgress: false,
      currentResult: hasResult
        ? {
            entryId: entry.id,
            classId,
            searchTime: competitionData.score ? parseFloat(competitionData.score) * 1000 : 0,
            maxTimeAllowed: classConfig.timeLimit,
            qualification: (competitionData.qualified === true
              ? 'Qualified'
              : 'Not Qualified') as QualificationStatus,
            faults: 0,
            judgeNotes: competitionData.judgeNotes || '',
            recordedBy: competitionData.recordedBy || 'System',
            recordedAt: new Date(competitionData.recordedAt || Date.now()),
          }
        : undefined,
    },
  };
}

/**
 * DB-only entries come from useClassEntriesWithQuery in a flat shape with
 * `armband`, `handler`, `dog`, `score`, `time`, `placement`, `status`. We
 * build a minimal ScentWorkEntry stub — enough to render the entry in the
 * dashboard, but without the full ShowEntry audit trail that local entries
 * carry. Consumers that need full data should rely on the local store.
 */
function buildScentWorkEntryFromDb(
  dbEntry: {
    id: string;
    classId?: string;
    armband?: string;
    handler?: string;
    dog?: string;
    score?: string;
    time?: string;
    placement?: string;
    status?: string;
  },
  classConfig: ScentWorkClassConfig,
  classId: string
): ScentWorkEntry {
  return {
    id: dbEntry.id,
    classId: dbEntry.classId || classId,
    dogId: '',
    showId: '',
    status: 'submitted',
    statusHistory: [],
    createdAt: '',
    updatedAt: '',
    registrationData: {
      submittedAt: new Date(0),
      handler: dbEntry.handler || '',
      entryFee: 0,
      paymentStatus: 'pending',
    },
    competitionData: {
      score: dbEntry.score || '',
      time: dbEntry.time || '',
      qualified: dbEntry.status === 'Qualified',
      placement: dbEntry.placement || '',
      recordedAt: new Date(0),
      recordedBy: 'System',
    },
    classConfig,
    displayInfo: {
      armband: dbEntry.armband || '',
      dogName: dbEntry.dog || 'Unknown Dog',
      dogBreed: 'Unknown Breed',
      handlerName: dbEntry.handler || 'Unknown Handler',
      dogId: '',
      handlerId: '',
    },
    judgingState: {
      isInProgress: false,
      currentResult: undefined,
    },
  } as ScentWorkEntry;
}

/**
 * Merge DB + local entries for a class and project them into ScentWorkEntry
 * shape.
 */
export function useClassScentWorkEntries(
  classId: string | undefined,
  classConfig: ScentWorkClassConfig
): UseClassScentWorkEntriesResult {
  const safeClassId = classId || '';
  const enabled = Boolean(classId);

  const {
    entries: dbEntries,
    isLoading,
    error,
  } = useClassEntriesWithQuery(safeClassId, enabled);

  const localEntries = useEntriesByClass(safeClassId);

  const { dogs } = useDogStoreCompat();
  const dogsById = useMemo(() => new Map(dogs.map(d => [d.id, d])), [dogs]);

  const entries = useMemo<ScentWorkEntry[]>(() => {
    if (!enabled) return [];

    const localScentWork = localEntries.map(entry =>
      buildScentWorkEntryFromLocal(entry as ShowEntry, classConfig, safeClassId, dogsById)
    );
    const localIds = new Set(localEntries.map(e => (e as ShowEntry).id));

    const dbOnlyEntries = dbEntries
      .filter(e => !localIds.has(e.id))
      .map(e => buildScentWorkEntryFromDb(e, classConfig, safeClassId));

    return [...localScentWork, ...dbOnlyEntries];
  }, [enabled, localEntries, dbEntries, classConfig, safeClassId, dogsById]);

  return {
    entries,
    isLoading,
    error: error ? new Error(error) : null,
    dbCount: dbEntries.length,
    localCount: localEntries.length,
  };
}
