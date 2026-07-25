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
import {
  isRunnableScheduleStatus,
  resolveClassSection,
} from '@/services/entryDisplay/entryDisplaySelectors';
import { dogsAheadInClass } from '@/utils/showEntryRunQueue';
import { hasScopedClubRole, hasScopedShowRole } from '@/utils/roleScopes';
import { resolveMoveUpDisplay } from '@/hooks/moveUpDisplay';
import { selectOwnedDogIds } from '@/utils/dogOwnership';
import { resolveClassJudgeName } from '@/utils/classJudgeDisplay';
import type { SyncableShowEntry } from '@/store/entry-store-types';
import type { EntryStatus } from '@/types/entry-lifecycle';
import type { EntryPaymentStatus } from '@/components/shows/tabs/entryResultDisplay';
import type {
  SubmittedEntryDbRow,
  SubmittedEntryReadState,
} from '@/features/exhibitor-entry/submittedEntryProjection';
import { isCheckInStatus, type CheckInStatus } from '@myk9/core';

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
  scheduleEntries: EnrichedShowEntry[];
  totalClasses: number;
  scheduleDogCount: number;
  isLoading: boolean;
  isError: boolean;
}

export interface CanonicalShowEntrySource {
  /** Rows already filtered by the route's owned-entry projection. */
  rows: readonly SubmittedEntryDbRow[];
  state: SubmittedEntryReadState;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function relatedString(
  row: SubmittedEntryDbRow | undefined,
  relation: 'class' | 'dog',
  field: string
): string | undefined {
  const related = row?.[relation];
  if (!related || typeof related !== 'object') return undefined;
  return stringValue((related as Record<string, unknown>)[field]);
}

function canonicalEntryStatus(value: unknown): EntryStatus {
  switch (value) {
    case 'accepted':
      return 'confirmed';
    case 'pending':
      return 'submitted';
    case 'rejected':
      return 'not_accepted';
    case 'cancelled':
      return 'withdrawn';
    case 'scratch_requested':
      return 'scratch-requested';
    case 'move_up_requested':
      return 'move-up-requested';
    default:
      return (stringValue(value) ?? 'no-status') as EntryStatus;
  }
}

function canonicalCheckInStatus(value: unknown): CheckInStatus | undefined {
  return typeof value === 'string' && isCheckInStatus(value) ? value : undefined;
}

function canonicalPaymentStatus(
  value: unknown
): SyncableShowEntry['registrationData']['paymentStatus'] {
  return value === 'paid' || value === 'refunded' ? value : 'pending';
}

function normalizeCanonicalEntry(row: SubmittedEntryDbRow): SyncableShowEntry | null {
  const id = stringValue(row.id);
  const showId = stringValue(row.show_id);
  const classId = stringValue(row.class_id);
  const dogId = stringValue(row.dog_id);
  if (!id || !showId || !classId || !dogId) return null;

  const submittedAt = stringValue(row.submitted_at) ?? stringValue(row.created_at) ?? '';
  const updatedAt = stringValue(row.updated_at) ?? submittedAt;
  const checkInStatus = canonicalCheckInStatus(row.check_in_status);
  const specialRequests = stringValue(row.special_requests);
  const armband = stringValue(row.armband);
  const handlerId = stringValue(row.handler_id);
  const registrationId = stringValue(row.registration_id);
  const runOrder = numberValue(row.run_order);

  return {
    id,
    showId,
    classId,
    dogId,
    status: canonicalEntryStatus(row.entry_status),
    ...(checkInStatus ? { checkInStatus } : {}),
    registrationData: {
      submittedAt,
      handler: stringValue(row.handler) ?? '',
      ...(handlerId ? { handlerId } : {}),
      entryFee: numberValue(row.entry_fee) ?? 0,
      paymentStatus: canonicalPaymentStatus(row.payment_status),
      ...(specialRequests ? { specialRequests } : {}),
      ...(armband ? { armband } : {}),
      ...(runOrder !== undefined ? { runOrder } : {}),
    },
    statusHistory: [],
    ...(registrationId ? { registrationId } : {}),
    createdAt: submittedAt,
    updatedAt,
    _version: numberValue(row.version) ?? 0,
    _lastModified: new Date(updatedAt || 0),
    _lastModifiedBy: 'canonical-show-entry-read',
    _syncStatus: 'synced',
  };
}

export function mergeCanonicalEntry(
  canonical: SyncableShowEntry,
  stored: SyncableShowEntry | undefined
): SyncableShowEntry {
  if (!stored) return canonical;
  return {
    ...stored,
    status: canonical.status,
    // The canonical per-show read is authoritative. A null status explicitly
    // clears a stale local status such as `pulled`.
    checkInStatus: canonical.checkInStatus ?? 'no-status',
    registrationData: {
      ...stored.registrationData,
      ...canonical.registrationData,
    },
    updatedAt: canonical.updatedAt,
  };
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

export function useShowEntriesForUser(
  showId: string | undefined,
  canonicalSource?: CanonicalShowEntrySource
): UseShowEntriesForUserResult {
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
  const currentShow = shows.find(show => show.id === showId);
  const showClubId = currentShow?.clubId;
  const clubAdminCanSeeShow =
    hasRole(UserRole.CLUB_ADMIN) &&
    hasScopedClubRole(userWithRoles, UserRole.CLUB_ADMIN, showClubId);
  const secretaryCanSeeShow =
    isSecretary &&
    (hasScopedClubRole(userWithRoles, UserRole.SECRETARY, showClubId) ||
      hasScopedShowRole(userWithRoles, UserRole.SECRETARY, showId));
  const canSeeAll = isAdmin || secretaryCanSeeShow || clubAdminCanSeeShow;

  return useMemo(() => {
    const sourceIsLoading = canonicalSource ? canonicalSource.state === 'loading' : isLoading;
    const sourceIsError = canonicalSource ? canonicalSource.state === 'error' : !!error;
    const empty = {
      dogGroups: [],
      allEntries: [],
      scheduleEntries: [],
      totalClasses: 0,
      scheduleDogCount: 0,
      isLoading: sourceIsLoading,
      isError: sourceIsError,
    };

    if (!showId) return empty;

    const storeEntryById = new Map(storeEntries.map(entry => [entry.id, entry]));
    const canonicalRowById = new Map(
      (canonicalSource?.rows ?? []).flatMap(row => {
        const id = stringValue(row.id);
        return id ? [[id, row] as const] : [];
      })
    );
    const allShowEntries = canonicalSource
      ? canonicalSource.rows.flatMap(row => {
          const canonical = normalizeCanonicalEntry(row);
          return canonical
            ? [mergeCanonicalEntry(canonical, storeEntryById.get(canonical.id))]
            : [];
        })
      : storeEntries.filter(e => e.showId === showId);
    let myEntries = allShowEntries;
    let visibleDogIds = new Set(allShowEntries.map(e => e.dogId));
    if (!canSeeAll) {
      if (canonicalSource) {
        // The route projection already applied owned-dog filtering. Keep these
        // rows renderable while the independent dog store is still cold.
        visibleDogIds = new Set(allShowEntries.map(entry => entry.dogId));
      } else {
        if (!databaseUserId) return empty;
        visibleDogIds = selectOwnedDogIds(dogs, databaseUserId);
        if (visibleDogIds.size === 0) return empty;
        myEntries = allShowEntries.filter(e => visibleDogIds.has(e.dogId));
      }
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

    // Pre-group runnable show entries by classId for O(N) dogsAhead computation.
    // Withdrawn / scratched / not-accepted / moved source rows remain available
    // in the history list, but they are not physically ahead in the run schedule.
    const entriesByClassId = new Map<string, SyncableShowEntry[]>();
    for (const e of allShowEntries) {
      if (!isRunnableScheduleStatus(e.status) || suppressedEntryIds.has(e.id)) continue;
      const bucket = entriesByClassId.get(e.classId);
      if (bucket) bucket.push(e);
      else entriesByClassId.set(e.classId, [e]);
    }

    const enriched: EnrichedShowEntry[] = [];
    for (const entry of myEntries) {
      if (suppressedEntryIds.has(entry.id)) continue;
      const cls = classMap.get(entry.classId);
      const canonicalRow = canonicalRowById.get(entry.id);
      if (!cls && !canonicalRow) continue;
      const fallbackClassTitle =
        relatedString(canonicalRow, 'class', 'name') ?? 'Class details pending';
      const fallbackDogName =
        relatedString(canonicalRow, 'dog', 'call_name') ??
        relatedString(canonicalRow, 'dog', 'name') ??
        'Unknown Dog';

      const runOrder = entry.registrationData.runOrder ?? 0;
      // Shared run queue (see utils/showEntryRunQueue): the in-ring dog is
      // excluded, so this is the same number the entry-list pill, the ring
      // conflict label and the "your turn" push all report.
      const dogsAhead = dogsAheadInClass(entriesByClassId.get(entry.classId) ?? [], entry.id) ?? 0;

      const movedUpFromClassId = movedUpFromClassIdByEntryId.get(entry.id);
      const movedUpFromClass = movedUpFromClassId ? classMap.get(movedUpFromClassId) : undefined;
      const movedUpFrom = movedUpFromClass ? classDisplayName(movedUpFromClass) : undefined;

      const trialDate = (cls?.trialDate ?? '').split('T')[0];
      const element = cls?.element ?? fallbackClassTitle;
      const level = cls?.level ?? '';
      const section = cls?.section ?? '';

      const compData = entry.competitionData;
      const hasResult = !!compData;

      enriched.push({
        entryId: entry.id,
        classId: entry.classId,
        trialId: cls?.trialId ?? stringValue(canonicalRow?.trial_id) ?? '',
        dogId: entry.dogId,
        dogName: dogNameMap.get(entry.dogId) ?? fallbackDogName,
        armband: entry.registrationData.armband ?? '',
        runOrder,
        element,
        level,
        section,
        classTitle: cls ? classDisplayName(cls) || fallbackClassTitle : fallbackClassTitle,
        trialDate,
        dayLabel: trialDate ? formatDayLabel(trialDate) : '',
        trialName: cls?.trial ?? '',
        startTime: cls?.startTime ?? '',
        judgeName: cls ? resolveClassJudgeName(cls, currentShow?.assignedJudges ?? []) : '',
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
    const scheduleEntries = allEntries.filter(entry => isRunnableScheduleStatus(entry.entryStatus));
    const scheduleDogCount = new Set(scheduleEntries.map(entry => entry.dogId)).size;

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
      scheduleEntries,
      totalClasses: scheduleEntries.length,
      scheduleDogCount,
      isLoading: sourceIsLoading,
      isError: sourceIsError,
    };
  }, [
    showId,
    databaseUserId,
    canSeeAll,
    storeEntries,
    classes,
    dogs,
    currentShow?.assignedJudges,
    isLoading,
    error,
    canonicalSource,
  ]);
}
