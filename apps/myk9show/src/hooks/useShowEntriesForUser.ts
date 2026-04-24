/**
 * useShowEntriesForUser — enriched entry data for the "My entries at this show" redesign.
 *
 * Joins the entry store with class store and dog store to produce a richer
 * view than useMyEntries: element, level, trialDate, startTime, and result
 * are all resolved here so display components stay pure.
 */

import { useMemo } from 'react';
import { useEntryStore } from '@/store/entryStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getDogDisplayName } from '@/types/dog-types';
import { getClassName } from '@/components/classes/types/classTypes';
import type { SyncableShowEntry } from '@/store/entry-store-types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EnrichedShowEntry {
  entryId: string;
  classId: string;
  trialId: string;
  dogId: string;
  dogName: string;
  armband: string;
  runOrder: number;
  element: string;
  level: string;
  section: string;
  classTitle: string;
  trialDate: string;  // "YYYY-MM-DD"
  dayLabel: string;   // "Saturday, May 10"
  trialName: string;  // "Trial 1", "Trial 2 PM"
  startTime: string;  // "9:00 AM" or ""
  judgeName: string;
  dogsAhead: number;
  hasResult: boolean;
  result?: {
    qualified: boolean;
    time?: string;
    placement?: number;
    faults?: number;
  };
}

export interface DogEntriesGroup {
  dogId: string;
  dogName: string;
  entries: EnrichedShowEntry[];
}

export interface UseShowEntriesForUserResult {
  dogGroups: DogEntriesGroup[];
  allEntries: EnrichedShowEntry[];
  totalClasses: number;
  isLoading: boolean;
  isError: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY: UseShowEntriesForUserResult = {
  dogGroups: [],
  allEntries: [],
  totalClasses: 0,
  isLoading: false,
  isError: false,
};

function formatDayLabel(isoDate: string): string {
  const dateOnly = isoDate.split('T')[0];
  if (!dateOnly) return '';
  const d = new Date(dateOnly + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function entryIsScored(entry: SyncableShowEntry): boolean {
  return entry.status === 'completed' || !!entry.competitionData;
}

function compareByTime(a: EnrichedShowEntry, b: EnrichedShowEntry): number {
  if (a.trialDate !== b.trialDate) return a.trialDate.localeCompare(b.trialDate);
  return a.startTime.localeCompare(b.startTime);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShowEntriesForUser(showId: string | undefined): UseShowEntriesForUserResult {
  const { userWithRoles } = useAuthContext();
  const storeEntries = useEntryStore(s => s.entries);
  const isLoading = useEntryStore(s => s.isLoading);
  const error = useEntryStore(s => s.error);
  const { classes } = useClassStoreCompat();
  const { dogs } = useDogStoreCompat();

  const databaseUserId = userWithRoles?.databaseUserId;

  return useMemo(() => {
    if (!showId || !databaseUserId) {
      return { ...EMPTY, isLoading, isError: !!error };
    }

    const myDogIds = new Set(dogs.filter(d => d.ownerId === databaseUserId).map(d => d.id));
    if (myDogIds.size === 0) return { ...EMPTY, isLoading, isError: !!error };

    const allShowEntries = storeEntries.filter(e => e.showId === showId);
    const myEntries = allShowEntries.filter(e => myDogIds.has(e.dogId));
    if (myEntries.length === 0) return { ...EMPTY, isLoading, isError: !!error };

    const classMap = new Map(classes.map(c => [c.id, c]));
    const dogNameMap = new Map(
      dogs.filter(d => myDogIds.has(d.id)).map(d => [d.id, getDogDisplayName(d) || 'Unknown Dog'])
    );

    // Pre-group all show entries by classId for O(N) dogsAhead computation.
    const entriesByClassId = new Map<string, SyncableShowEntry[]>();
    for (const e of allShowEntries) {
      const bucket = entriesByClassId.get(e.classId);
      if (bucket) bucket.push(e);
      else entriesByClassId.set(e.classId, [e]);
    }

    const enriched: EnrichedShowEntry[] = [];
    for (const entry of myEntries) {
      const cls = classMap.get(entry.classId);
      if (!cls) continue;

      const runOrder = entry.registrationData.runOrder ?? 0;
      const dogsAhead =
        runOrder > 0
          ? (entriesByClassId.get(entry.classId) ?? []).filter(
              e =>
                (e.registrationData.runOrder ?? 0) > 0 &&
                (e.registrationData.runOrder ?? 0) < runOrder &&
                !entryIsScored(e)
            ).length
          : 0;

      const trialDate = (cls.trialDate ?? '').split('T')[0];
      const element = cls.element ?? '';
      const level = cls.level ?? '';
      const section = cls.section ?? '';

      const compData = entry.competitionData;
      const hasResult = !!compData;

      enriched.push({
        entryId: entry.id,
        classId: entry.classId,
        trialId: cls.trialId,
        dogId: entry.dogId,
        dogName: dogNameMap.get(entry.dogId) ?? 'Unknown Dog',
        armband: entry.registrationData.armband ?? '',
        runOrder,
        element,
        level,
        section,
        classTitle:
          getClassName({ element, level, section, className: cls.className }) || 'Unnamed Class',
        trialDate,
        dayLabel: trialDate ? formatDayLabel(trialDate) : '',
        trialName: cls.trial ?? '',
        startTime: cls.startTime ?? '',
        judgeName: cls.judge ?? '',
        dogsAhead,
        hasResult,
        ...(hasResult && compData
          ? {
              result: {
                qualified: compData.qualified ?? false,
                time: compData.time ?? undefined,
                placement: compData.placement ? parseInt(compData.placement, 10) : undefined,
                faults: compData.faults ?? undefined,
              },
            }
          : {}),
      });
    }

    const allEntries = [...enriched].sort(compareByTime);

    // Group by dog, preserving dog order from the store.
    const dogGroupMap = new Map<string, EnrichedShowEntry[]>();
    for (const entry of enriched) {
      const bucket = dogGroupMap.get(entry.dogId);
      if (bucket) bucket.push(entry);
      else dogGroupMap.set(entry.dogId, [entry]);
    }

    const dogGroups: DogEntriesGroup[] = Array.from(dogGroupMap.entries()).map(
      ([dogId, entries]) => ({
        dogId,
        dogName: dogNameMap.get(dogId) ?? 'Unknown Dog',
        entries: [...entries].sort(compareByTime),
      })
    );

    return {
      dogGroups,
      allEntries,
      totalClasses: enriched.length,
      isLoading,
      isError: !!error,
    };
  }, [showId, databaseUserId, storeEntries, classes, dogs, isLoading, error]);
}
