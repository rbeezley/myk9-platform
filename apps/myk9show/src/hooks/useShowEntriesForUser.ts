import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEntryStore } from '@/store/entryStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStoreCompat } from '@/hooks/useShowStoreCompat';
import { getDogDisplayName } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { getClassName } from '@/components/classes/types/classTypes';
import { resolveClassSection } from '@/services/entryDisplay/entryDisplaySelectors';
import { entryIsScored } from '@/utils/entryPredicates';
import { hasScopedClubRole, hasScopedShowRole } from '@/utils/roleScopes';
import { resolveMoveUpDisplay } from '@/hooks/moveUpDisplay';
import { selectOwnedDogIds } from '@/utils/dogOwnership';
import type { SyncableShowEntry } from '@/store/entry-store-types';
import type { EntryStatus } from '@/types/entry-lifecycle';
import type { EntryPaymentStatus } from '@/components/shows/tabs/entryResultDisplay';

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
  trialDate: string; // "YYYY-MM-DD"
  dayLabel: string; // "Saturday, May 10"
  trialName: string; // "Trial 1", "Trial 2 PM"
  startTime: string; // "9:00 AM" or ""
  judgeName: string;
  dogsAhead: number;
  // Lifecycle + payment state, carried through so terminal states (withdrawn,
  // scratched, refunded) render the same on this tab as on the secretary's
  // Entry Management view (UX-P1-04) instead of falling through to "Upcoming".
  entryStatus: EntryStatus;
  paymentStatus: EntryPaymentStatus;
  hasResult: boolean;
  /** Set on a move-up destination row: the human name of the class moved up from. */
  movedUpFrom?: string;
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

function formatDayLabel(isoDate: string): string {
  const dateOnly = isoDate.split('T')[0];
  if (!dateOnly) return '';
  const d = new Date(dateOnly + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function compareByTime(a: EnrichedShowEntry, b: EnrichedShowEntry): number {
  if (a.trialDate !== b.trialDate) return a.trialDate.localeCompare(b.trialDate);
  return a.startTime.localeCompare(b.startTime);
}

interface ClassNameFields {
  element?: string | null | undefined;
  level?: string | null | undefined;
  section?: string | null | undefined;
  className?: string | undefined;
}

function classDisplayName(cls: ClassNameFields): string {
  return getClassName({
    element: cls.element ?? '',
    level: cls.level ?? '',
    section: resolveClassSection(cls.section),
    className: cls.className,
  });
}

export function useShowEntriesForUser(showId: string | undefined): UseShowEntriesForUserResult {
  const { userWithRoles, isAdmin, isSecretary, hasRole } = useAuthContext();
  const {
    entries: storeEntries,
    isLoading,
    error,
  } = useEntryStore(
    useShallow(s => ({ entries: s.entries, isLoading: s.isLoading, error: s.error }))
  );
  const { classes } = useClassStoreCompat();
  const { dogs } = useDogStoreCompat();
  const { shows } = useShowStoreCompat();

  const databaseUserId = userWithRoles?.databaseUserId;
  const showClubId = shows.find(show => show.id === showId)?.clubId;
  const clubAdminCanSeeShow =
    hasRole(UserRole.CLUB_ADMIN) &&
    hasScopedClubRole(userWithRoles, UserRole.CLUB_ADMIN, showClubId);
  const secretaryCanSeeShow =
    isSecretary &&
    (hasScopedClubRole(userWithRoles, UserRole.SECRETARY, showClubId) ||
      hasScopedShowRole(userWithRoles, UserRole.SECRETARY, showId));
  const canSeeAll = isAdmin || secretaryCanSeeShow || clubAdminCanSeeShow;

  return useMemo(() => {
    const empty = { dogGroups: [], allEntries: [], totalClasses: 0, isLoading, isError: !!error };

    if (!showId) return empty;

    const allShowEntries = storeEntries.filter(e => e.showId === showId);
    let myEntries = allShowEntries;
    let visibleDogIds = new Set(allShowEntries.map(e => e.dogId));
    if (!canSeeAll) {
      if (!databaseUserId) return empty;
      visibleDogIds = selectOwnedDogIds(dogs, databaseUserId);
      if (visibleDogIds.size === 0) return empty;
      myEntries = allShowEntries.filter(e => visibleDogIds.has(e.dogId));
    }
    if (myEntries.length === 0) return empty;

    // A move-up leaves the source row (status='moved') and a new destination row
    // for the same dog. Suppress the dead source row (it never runs in its old
    // class) and remember each destination's origin class for an annotation, so
    // this view agrees with the secretary's Show Map (which resolves the dog to
    // its destination class).
    const { suppressedEntryIds, movedUpFromClassIdByEntryId } = resolveMoveUpDisplay(
      myEntries.map(e => ({
        id: e.id,
        dogId: e.dogId,
        classId: e.classId,
        status: e.status,
        specialRequests: e.registrationData.specialRequests,
      }))
    );

    const classMap = new Map(classes.map(c => [c.id, c]));
    const dogNameMap = new Map(
      dogs
        .filter(d => visibleDogIds.has(d.id))
        .map(d => [d.id, getDogDisplayName(d) || 'Unknown Dog'])
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
      if (suppressedEntryIds.has(entry.id)) continue;
      const cls = classMap.get(entry.classId);
      if (!cls) continue;

      const runOrder = entry.registrationData.runOrder ?? 0;
      const dogsAhead =
        runOrder > 0
          ? (entriesByClassId.get(entry.classId) ?? []).filter(
              e =>
                (e.registrationData.runOrder ?? 0) > 0 &&
                (e.registrationData.runOrder ?? 0) < runOrder &&
                // A moved-up source row never runs, so it isn't "ahead".
                e.status !== 'moved' &&
                !entryIsScored(e)
            ).length
          : 0;

      const movedUpFromClassId = movedUpFromClassIdByEntryId.get(entry.id);
      const movedUpFromClass = movedUpFromClassId ? classMap.get(movedUpFromClassId) : undefined;
      const movedUpFrom = movedUpFromClass ? classDisplayName(movedUpFromClass) : undefined;

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
        classTitle: classDisplayName(cls) || 'Unnamed Class',
        trialDate,
        dayLabel: trialDate ? formatDayLabel(trialDate) : '',
        trialName: cls.trial ?? '',
        startTime: cls.startTime ?? '',
        judgeName: cls.judge ?? '',
        dogsAhead,
        entryStatus: entry.status,
        paymentStatus: entry.registrationData.paymentStatus,
        hasResult,
        ...(movedUpFrom ? { movedUpFrom } : {}),
        ...(hasResult && compData
          ? {
              result: {
                qualified: compData.qualified ?? false,
                ...(compData.time != null ? { time: compData.time } : {}),
                ...(compData.placement ? { placement: parseInt(compData.placement, 10) } : {}),
                ...(compData.faults != null ? { faults: compData.faults } : {}),
              },
            }
          : {}),
      });
    }

    const allEntries = [...enriched].sort(compareByTime);

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
  }, [showId, databaseUserId, canSeeAll, storeEntries, classes, dogs, isLoading, error]);
}
