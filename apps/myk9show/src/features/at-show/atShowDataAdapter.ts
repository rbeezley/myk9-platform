/**
 * Phase 1a data-dependency adapter — myK9Show replication → ringside.
 *
 * Implements ringside's `EntryListDataDependencies` (fetchSingleClass /
 * fetchCombinedClasses / forceSyncEntriesAndClasses / subscribeToReplication
 * Changes) on top of myK9Show's existing offline-first replication tables.
 * Modeled on myK9Q's `useEntryListDataHelpers` (pattern, not copy — different
 * table APIs and schema).
 *
 * Post id-migration (#424): ringside `Entry.id`/`classId`/`actualClassId` and
 * `ClassInfo.trialId`/`actualClassId` are now `string` (UUID-native), so
 * myK9Show's string UUIDs pass straight through — NO parseInt. Only `armband`
 * and `placement` are genuine `number` targets and coerce via `Number(...)`.
 *
 * Field mapping is the VERIFIED data-transform spec in
 * docs/plans/phase-1-execution-package.md (Tables 1 & 2), citing both schemas.
 */

import type { Entry, ClassInfo, EntryListData, EntryListDataDependencies } from '@myk9/ringside';
import type { EntryStatus } from '@myk9/core';
import {
  replicatedEntriesTable,
  replicatedClassesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

/** Build the rendered class name from element + level (+ section unless '-'). */
function buildClassName(cls: ReplicatedClass | null): string {
  if (!cls) return '';
  const section = cls.section && cls.section !== '-' ? ` ${cls.section}` : '';
  return `${cls.element ?? ''} ${cls.level ?? ''}${section}`.trim();
}

/**
 * Render a `time_limit_seconds` value as the ringside `ClassInfo.timeLimit`
 * string (`"180s"`). The downstream popover re-parses this back to a number,
 * so the ONLY values we may emit are clean numeric-seconds strings — never a
 * placeholder like `"TBD"`.
 *
 * `ReplicatedClass.timeLimitSeconds` is an `as number` cast over a loosely
 * typed DB row, so a non-numeric placeholder can slip past the compiler at
 * runtime. Guarding on `Number.isFinite` (and `> 0`) keeps junk from being
 * laundered into `"TBDs"` / `"NaNs"`; such inputs collapse to `undefined`
 * (no limit) instead.
 */
function timeLimitString(seconds?: number): string | undefined {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? `${seconds}s`
    : undefined;
}

/**
 * Transform a myK9Show `ReplicatedEntry` (+ its class for header fields) into a
 * ringside `Entry`. See data-transform spec Table 1.
 *
 * Status source: myK9Show has a dedicated `checkInStatus` column (typed
 * `CheckInStatus` = ringside `EntryStatus`), so we use it directly rather than
 * deriving from the lifecycle `entry_status` string the way myK9Q must.
 */
export function transformEntry(re: ReplicatedEntry, cls: ReplicatedClass | null): Entry {
  const status: EntryStatus = (re.checkInStatus ?? re.check_in_status ?? 'no-status') as EntryStatus;
  const checkinStatus = re.checkInStatus ?? re.check_in_status;
  const finalPlacement = re.finalPlacement ?? re.final_placement;
  const searchTimeSeconds = re.searchTimeSeconds ?? re.search_time_seconds;
  const resultText = re.resultStatus ?? re.result_status;
  const faultCount = re.totalFaults ?? re.total_faults;
  const totalPoints = re.totalPoints ?? re.total_points;
  const areas = cls?.areaCount ?? cls?.area_count ?? re.areas;
  const timeLimit = timeLimitString(cls?.timeLimitSeconds ?? cls?.time_limit_seconds);
  const timeLimit2 = timeLimitString(cls?.timeLimitArea2Seconds ?? cls?.time_limit_area2_seconds);
  const timeLimit3 = timeLimitString(cls?.timeLimitArea3Seconds ?? cls?.time_limit_area3_seconds);

  // Optional fields are spread conditionally: under exactOptionalPropertyTypes
  // an optional `field?: T` rejects an explicit `undefined` value, so absent
  // sources are omitted entirely rather than set to undefined.
  return {
    // Identity — string UUIDs pass through directly (post #424).
    id: re.id,
    classId: re.classId ?? re.class_id ?? '',
    actualClassId: re.classId ?? re.class_id ?? '',

    // Competitor number — genuinely numeric; coerce from the string source.
    armband: re.armband != null ? Number(re.armband) : 0,

    callName: re.dogCallName ?? re.dog_call_name ?? '',
    breed: re.dogBreed ?? re.dog_breed ?? '',
    handler: re.handler ?? re.handlerName ?? re.handler_name ?? '',

    isScored: re.isScored ?? re.is_scored ?? false,
    status,
    // Deprecated compat fields.
    inRing: status === 'in-ring',
    checkedIn: checkinStatus === 'checked-in',

    // Class-derived header fields.
    className: buildClassName(cls),
    section: cls?.section ?? '',
    element: cls?.element ?? re.element ?? '',
    level: cls?.level ?? re.level ?? '',

    exhibitorOrder: re.runOrder ?? 0,

    // INTENT (Phase 1a spike): /at-show is staff-facing (admin/judge/steward),
    // so result-visibility flags default open. A faithful per-role/timing
    // visibility pass (mirroring myK9Q's getVisibleResultFields) is deferred to
    // the later /at-show UI sprint — do not treat these defaults as the
    // production visibility policy.
    showPlacement: true,
    showQualification: true,
    showTime: true,
    showFaults: true,

    ...(re.jumpHeight != null && { jumpHeight: re.jumpHeight }),
    ...(checkinStatus != null && { checkinStatus }),
    ...(resultText != null && { resultText }),
    ...(searchTimeSeconds != null && { searchTime: String(searchTimeSeconds) }),
    ...(faultCount != null && { faultCount }),
    ...(finalPlacement != null && { placement: Number(finalPlacement) }),
    ...(totalPoints != null && { totalPoints }),
    ...(re.disqualification_reason != null && { nqReason: re.disqualification_reason }),
    ...(timeLimit != null && { timeLimit }),
    ...(timeLimit2 != null && { timeLimit2 }),
    ...(timeLimit3 != null && { timeLimit3 }),
    ...(areas != null && { areas }),
  };
}

/**
 * Build ringside `ClassInfo` from a myK9Show class (+ optional trial join +
 * the already-transformed entries for derived counts). See spec Table 2.
 */
export function buildClassInfo(
  cls: ReplicatedClass,
  trial: ReplicatedTrial | null,
  entries: Entry[]
): ClassInfo {
  const trialId = cls.trialId ?? cls.trial_id;
  const trialNumber = trial?.trialNumber ?? trial?.trial_number;
  const areas = cls.areaCount ?? cls.area_count;
  const timeLimit = timeLimitString(cls.timeLimitSeconds ?? cls.time_limit_seconds);
  const timeLimit2 = timeLimitString(cls.timeLimitArea2Seconds ?? cls.time_limit_area2_seconds);
  const timeLimit3 = timeLimitString(cls.timeLimitArea3Seconds ?? cls.time_limit_area3_seconds);

  return {
    className: buildClassName(cls),
    element: cls.element ?? '',
    level: cls.level ?? '',
    section: cls.section ?? '',
    trialDate: trial?.date ?? trial?.trial_date ?? entries[0]?.trialDate ?? '',
    judgeName: cls.judgeName ?? 'No Judge Assigned',
    actualClassId: cls.id,
    // Resolved visibility-cascade values, denormalized onto ReplicatedClass at
    // sync time so they survive offline (Phase 1h). Fall back to enabled/
    // 'standard' when a row hasn't been enriched yet (e.g. pre-migration cache).
    selfCheckin: cls.selfCheckinEnabled ?? true,
    classStatus: cls.classStatus ?? 'pending',
    totalEntries: entries.length,
    completedEntries: entries.filter(e => e.isScored).length,
    visibilityPreset: (cls.visibilityPreset as ClassInfo['visibilityPreset']) ?? 'standard',

    ...(trialId != null && { trialId }),
    ...(trialNumber != null && { trialNumber: String(trialNumber) }),
    ...(timeLimit != null && { timeLimit }),
    ...(timeLimit2 != null && { timeLimit2 }),
    ...(timeLimit3 != null && { timeLimit3 }),
    ...(areas != null && { areas }),
  };
}

async function fetchClassData(classId: string): Promise<{
  cls: ReplicatedClass | null;
  trial: ReplicatedTrial | null;
  entries: Entry[];
}> {
  const cls = await replicatedClassesTable.getClassById(classId);
  const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);
  const entries = rawEntries.map(re => transformEntry(re, cls));
  const trial = cls?.trialId ?? cls?.trial_id
    ? await replicatedTrialsTable.getTrialById((cls?.trialId ?? cls?.trial_id) as string)
    : null;
  return { cls, trial, entries };
}

/**
 * Assemble the `EntryListDataDependencies` bag the ringside `useEntryListData`
 * hook consumes. Pure factory — no React; the host shim wires it in.
 */
export function createAtShowDataDependencies(): Pick<
  EntryListDataDependencies,
  'fetchSingleClass' | 'fetchCombinedClasses' | 'forceSyncEntriesAndClasses' | 'subscribeToReplicationChanges'
> {
  return {
    fetchSingleClass: async (classId): Promise<EntryListData> => {
      const { cls, trial, entries } = await fetchClassData(classId);
      return {
        entries,
        classInfo: cls ? buildClassInfo(cls, trial, entries) : null,
      };
    },

    fetchCombinedClasses: async (classIdA, classIdB): Promise<EntryListData> => {
      const a = await fetchClassData(classIdA);
      const b = await fetchClassData(classIdB);
      const entries = [...a.entries, ...b.entries];
      // Combined view uses class A as the header source (mirrors myK9Q).
      const classInfo = a.cls
        ? {
            ...buildClassInfo(a.cls, a.trial, entries),
            actualClassIdA: classIdA,
            actualClassIdB: classIdB,
            judgeNameB: b.cls?.judgeName ?? 'No Judge Assigned',
          }
        : null;
      return { entries, classInfo };
    },

    forceSyncEntriesAndClasses: async (licenseKey): Promise<void> => {
      // Offline-first contract: rejection is expected offline; the hook
      // swallows it and falls back to cached data. We surface failures by
      // resolving (sync internally logs), matching myK9Q's Promise.all shape.
      await Promise.all([
        replicatedClassesTable.sync(licenseKey),
        replicatedEntriesTable.sync(licenseKey),
      ]);
    },

    // INTENT (spike): myK9Show drives live updates through ReplicationSync
    // Provider + React Query invalidation, not a per-table pub-sub the way
    // myK9Q does. The contract explicitly tolerates a no-op unsubscribe; a real
    // change-subscription is a follow-up once the /at-show page proves out.
    subscribeToReplicationChanges: (): (() => void) => {
      return () => {};
    },
  };
}
