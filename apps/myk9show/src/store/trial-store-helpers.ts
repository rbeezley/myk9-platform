import type { SyncableTrial, SyncableTrialClass } from './trial-store-types';
import type { ReplicatedTrial, ReplicatedClass } from '@/services/replication';
import { shouldUseMockData } from '@/config/dataSource';
import { classNameMatchesFields } from '@/features/_shared/classLabel';

/** Map a SyncableTrialClass to ReplicatedClass for offline persistence */
export function trialClassToReplicated(tc: SyncableTrialClass, trialId: string): ReplicatedClass {
  return {
    id: tc.id,
    trialId,
    // Keep the stored name, but only while it still agrees with the class's
    // current fields.
    //
    // Overwriting it unconditionally erases the only thing that distinguishes
    // two classes sharing element+level+section, and does so silently on a
    // round trip through the client. Keeping it unconditionally is worse:
    // TrialClassInput has no `name`, so editing a class from Interior/Advanced
    // to Interior/Excellent leaves "Interior Advanced" behind and the label
    // renders "Excellent Advanced" — a statement that is not merely incomplete
    // but false. Regenerate in that case (MYK9-489, review of #2196).
    name: classNameMatchesFields(tc.name, tc.element, tc.level, tc.section)
      ? (tc.name as string)
      : [tc.element, tc.level, tc.section].filter(Boolean).join(' ').trim() || tc.id,
    element: tc.element,
    level: tc.level,
    section: tc.section,
    judgeName: tc.judgeName,
    judgeId: tc.judgeId,
    startTime: tc.startTime,
    revisedExpectedStart: tc.revisedExpectedStart,
    actual_start_time: tc.actualStartTime,
    actual_end_time: tc.actualFinishTime,
    classStatus: tc.status,
    isScoringFinalized: tc.isScoringFinalized,
    isResultsReviewed: tc.isResultsReviewed,
    displayOrder: tc.displayOrder,
    maxEntries: tc.maxEntries ?? undefined,
    allowsWaitlist: tc.allowsWaitlist,
    judgeSignedOffAt: tc.judgeSignedOffAt,
    judgeSignedOffBy: tc.judgeSignedOffBy,
    _version: tc._version,
    _lastModified: tc._lastModified,
    _lastModifiedBy: tc._lastModifiedBy,
    _syncStatus: tc._syncStatus,
    _localOnly: tc._localOnly,
  };
}

/** Convert a ReplicatedClass (from IndexedDB) to SyncableTrialClass */
export function replicatedToTrialClass(replicated: ReplicatedClass): SyncableTrialClass {
  return {
    id: replicated.id,
    // Carried, not dropped: this is the offline-first path the registration
    // wizard prefers over its query and availability fallbacks, so a name lost
    // here is a name no exhibitor-facing surface can ever see (MYK9-489).
    name: replicated.name,
    element: replicated.element || '',
    level: replicated.level || '',
    section: replicated.section || '',
    judgeId: replicated.judgeId || '',
    judgeName: replicated.judgeName || '',
    startTime: replicated.startTime || '',
    revisedExpectedStart: replicated.revisedExpectedStart ?? null,
    actualStartTime: replicated.actual_start_time,
    actualFinishTime: replicated.actual_end_time,
    status: (replicated.classStatus as SyncableTrialClass['status']) || 'Scheduled',
    isScoringFinalized: replicated.isScoringFinalized ?? false,
    isResultsReviewed: replicated.isResultsReviewed ?? false,
    displayOrder: replicated.displayOrder,
    maxEntries: replicated.maxEntries ?? null,
    allowsWaitlist: replicated.allowsWaitlist,
    // The replica stores a NULL fee as undefined; a replicated row always carried it, so a
    // missing fee is 0, "no fee of its own" (MYK9-1931), as `mapDatabaseToClass` maps it.
    entryFee: replicated.entryFee ?? 0,
    runOrder: replicated.classOrder,
    reopenedAfterCloseoutAt: replicated.reopenedAfterCloseoutAt ?? null,
    resultsReleasedAt: replicated.resultsReleasedAt ?? null,
    judgeSignedOffAt: replicated.judgeSignedOffAt ?? null,
    judgeSignedOffBy: replicated.judgeSignedOffBy ?? null,
    scoresOnPaper: replicated.scoresOnPaper ?? null,
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/** Merge replicated class data with existing local class data, preserving local-only fields */
export function mergeTrialClassData(
  replicated: ReplicatedClass,
  existing: SyncableTrialClass | undefined
): SyncableTrialClass {
  const base = replicatedToTrialClass(replicated);
  if (!existing) return base;

  return {
    ...base,
    // Preserve local-only fields from existing
    // A RESOLVED row with no judge means the assignment was removed, so it wins; an unresolved
    // row only means the judge lookup did not run, so the judge already held is kept.
    judgeId:
      replicated.judgeResolved === true ? base.judgeId : base.judgeId || existing.judgeId || '',
  };
}

/**
 * Convert ReplicatedTrial (database schema) to SyncableTrial (app schema)
 */
export function replicatedToTrial(replicated: ReplicatedTrial): SyncableTrial {
  return {
    id: replicated.id,
    showId: replicated.showId || '',
    showName: '', // Derived from show join, not stored on trials table
    name: replicated.name,
    trialDate: replicated.date,
    trialNumber: replicated.trialNumber || '',
    status: (replicated.status as SyncableTrial['status']) || 'Upcoming',
    eventNumber: replicated.eventNumber || '',
    type: replicated.category || '',
    trialType: replicated.trialType || '',
    plannedStartTime: replicated.plannedStartTime || '',
    timeStarted: replicated.actualStartTime || '',
    timeEnded: replicated.actualEndTime || '',
    order: replicated.displayOrder !== undefined ? String(replicated.displayOrder) : '',
    image: replicated.imageUrl || '',
    // Heritage / registry columns (migration 192) — carry both so landing-data hooks
    // read the real timezone (not 'America/New_York') and registry-aware copy (not AKC).
    timezone: replicated.timezone ?? null,
    registryId: replicated.registryId ?? null,
    ...(replicated.autoCompleteStaleClasses !== undefined && {
      autoCompleteStaleClasses: replicated.autoCompleteStaleClasses,
    }),
    // Sync metadata
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/**
 * Merge replicated trial data with existing local trial data
 */
export function mergeTrialData(
  replicated: ReplicatedTrial,
  existing: SyncableTrial | undefined
): SyncableTrial {
  const base = replicatedToTrial(replicated);
  if (!existing) return base;

  return {
    ...base,
    // showName is derived from a join, not stored on the trials table
    showName: existing.showName || '',
  };
}

export const shouldUseMockTrials = () => {
  return shouldUseMockData('USE_MOCK_SHOWS'); // Trials are part of shows
};

// Mock data for initial state
export const mockTrials: SyncableTrial[] = [
  {
    id: '1',
    showId: '1',
    showName: 'Summer Specialty Show',
    name: 'Scent Work Interior Search',
    trialDate: '2025-07-20',
    trialNumber: 'T-2025-001',
    status: 'Upcoming',
    eventNumber: 'EV-2025-001',
    type: 'Interior Search',
    trialType: 'Scent Work',
    plannedStartTime: '09:00 AM',
    order: '1',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
  {
    id: '2',
    showId: '1',
    showName: 'Summer Specialty Show',
    name: 'Scent Work Exterior Search',
    trialDate: '2025-07-21',
    trialNumber: 'T-2025-002',
    status: 'Upcoming',
    eventNumber: 'EV-2025-045',
    type: 'Exterior Search',
    trialType: 'Scent Work',
    plannedStartTime: '10:30 AM',
    order: '2',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
  {
    id: '3',
    showId: '2',
    showName: 'Fall Agility Championship',
    name: 'Standard Agility',
    trialDate: '2025-10-15',
    trialNumber: 'TR-2025-003',
    status: 'Upcoming',
    eventNumber: 'EV-2025-003',
    type: 'Standard',
    trialType: 'Agility',
    plannedStartTime: '11:00 AM',
    order: '3',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
  {
    id: '4',
    showId: '4',
    showName: 'Summer Nosework Trial',
    name: 'Nosework Elements Trial',
    trialDate: '2025-08-10',
    trialNumber: 'TR-2025-004',
    status: 'Upcoming',
    eventNumber: 'EV-2025-004',
    type: 'Element Search',
    trialType: 'Nosework',
    plannedStartTime: '09:00 AM',
    order: '1',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
  {
    id: '5',
    showId: '5',
    showName: 'Fall Obedience & Rally Championship',
    name: 'Obedience & Rally Combined Trial',
    trialDate: '2025-09-25',
    trialNumber: 'TR-2025-005',
    status: 'Upcoming',
    eventNumber: 'EV-2025-005',
    type: 'Combined Trial',
    trialType: 'Obedience & Rally',
    plannedStartTime: '08:30 AM',
    order: '1',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
];

const TRIAL_STATUS_SPELLINGS: Record<string, string> = { scheduled: 'upcoming' };

function normalizeTrialStatus(status: string | undefined): string {
  const key = (status || 'Upcoming').trim().toLowerCase().replace(/\s+/g, '_');
  return TRIAL_STATUS_SPELLINGS[key] ?? key;
}

/**
 * MYK9-2450: whether a save changed the trial's status. 'Completed' and 'completed' are the
 * same status (the form and the database spell it differently), and a blank stored status
 * reads as Upcoming. `undefined` means the save did not mention it.
 */
export function trialStatusChanged(next: string | undefined, current: string | undefined): boolean {
  return next !== undefined && normalizeTrialStatus(next) !== normalizeTrialStatus(current);
}

function actualTimeMinute(value: string | undefined): number | string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : Math.floor(ms / 60_000);
}

/**
 * MYK9-2450: whether a save changed an actual start or finish. `undefined` means the save did
 * not mention it. The edit form shows a time to the minute, so an untouched field comes back
 * without its seconds: the same minute is the same time.
 */
export function actualTimeChanged(next: string | undefined, current: string | undefined): boolean {
  return next !== undefined && actualTimeMinute(next) !== actualTimeMinute(current);
}
