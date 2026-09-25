import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { requireShowEntriesSynced } from '@/services/database/entries/requireShowEntriesSynced';
import { readJudgeAssignmentsOrThrow } from '@/services/database/judges/assignmentReads';

const CAPACITY_STATUSES = new Set([
  'submitted',
  'paid',
  'confirmed',
  'checked-in',
  'competing',
  'in-ring',
  'pending-payment',
]);

interface CapacityClass {
  id: string;
  trialId?: string | undefined;
  maxEntries?: number | undefined;
}

interface CapacityTrial {
  id: string;
  date: string;
}

interface CapacityAssignment {
  classId: string | null;
  personId: string;
  status: string | null;
  dayCapacityOverride?: number | null | undefined;
}

interface CapacityEntry {
  classId?: string | undefined;
  entryStatus?: string | undefined;
  entry_status?: string | undefined;
  status?: string | undefined;
  deletedAt?: string | null | undefined;
  deleted_at?: string | null | undefined;
}

export interface OfflineCapacitySelection {
  key: string;
  classId: string;
}

interface OfflineCapacityInput {
  selections: OfflineCapacitySelection[];
  classes: CapacityClass[];
  trials: CapacityTrial[];
  assignments: CapacityAssignment[];
  entries: CapacityEntry[];
  defaultJudgeDayCapacity: number;
}

function consumesCapacity(entry: CapacityEntry): boolean {
  if (entry.deletedAt || entry.deleted_at) return false;
  return CAPACITY_STATUSES.has(entry.entryStatus ?? entry.entry_status ?? entry.status ?? '');
}

export function calculateOfflineCapacityOverrides({
  selections,
  classes,
  trials,
  assignments,
  entries,
  defaultJudgeDayCapacity,
}: OfflineCapacityInput): Record<string, boolean> {
  const classesById = new Map(classes.map(entryClass => [entryClass.id, entryClass]));
  const trialDates = new Map(trials.map(trial => [trial.id, trial.date]));
  const consumingEntries = entries.filter(consumesCapacity);
  const assignmentsByClass = new Map<string, CapacityAssignment[]>();
  const classCounts = new Map<string, number>();
  const judgeDayCounts = new Map<string, number>();
  const judgeDayCapacities = new Map<string, number>();

  for (const entry of consumingEntries) {
    if (!entry.classId) continue;
    classCounts.set(entry.classId, (classCounts.get(entry.classId) ?? 0) + 1);
  }

  for (const assignment of assignments) {
    if (assignment.status !== 'confirmed' || !assignment.classId) continue;
    const current = assignmentsByClass.get(assignment.classId) ?? [];
    current.push(assignment);
    assignmentsByClass.set(assignment.classId, current);
  }

  for (const [classId, classAssignments] of assignmentsByClass) {
    const entryClass = classesById.get(classId);
    const trialDate = entryClass?.trialId ? trialDates.get(entryClass.trialId) : undefined;
    if (!trialDate) continue;

    for (const assignment of classAssignments) {
      const judgeDayKey = `${assignment.personId}|${trialDate}`;
      const override = assignment.dayCapacityOverride;
      if (override != null) {
        judgeDayCapacities.set(
          judgeDayKey,
          Math.max(judgeDayCapacities.get(judgeDayKey) ?? override, override)
        );
      }
      judgeDayCounts.set(
        judgeDayKey,
        (judgeDayCounts.get(judgeDayKey) ?? 0) + (classCounts.get(classId) ?? 0)
      );
    }
  }

  const overrides: Record<string, boolean> = {};
  for (const selection of selections) {
    const entryClass = classesById.get(selection.classId);
    const classCount = classCounts.get(selection.classId) ?? 0;
    const classFull =
      (entryClass?.maxEntries ?? 0) > 0 && classCount >= (entryClass?.maxEntries ?? 0);
    const trialDate = entryClass?.trialId ? trialDates.get(entryClass.trialId) : undefined;
    const judgeDayKeys = trialDate
      ? (assignmentsByClass.get(selection.classId) ?? []).map(
          assignment => `${assignment.personId}|${trialDate}`
        )
      : [];
    const judgeDayFull = judgeDayKeys.some(
      key =>
        (judgeDayCounts.get(key) ?? 0) >= (judgeDayCapacities.get(key) ?? defaultJudgeDayCapacity)
    );

    overrides[selection.key] = classFull || judgeDayFull;
    classCounts.set(selection.classId, classCount + 1);
    for (const key of judgeDayKeys) {
      judgeDayCounts.set(key, (judgeDayCounts.get(key) ?? 0) + 1);
    }
  }

  return overrides;
}

/** Plain language for the desk: a raw storage error means nothing there. */
const CAPACITY_UNREADABLE =
  "We couldn't check class capacity on this device. Reload the page and try again.";

async function rowsOrThrow<T>(read: Promise<{ ok: boolean; rows: T[] }>): Promise<T[]> {
  const result = await read;
  if (!result.ok) throw new Error(CAPACITY_UNREADABLE);
  return result.rows;
}

export async function loadOfflineCapacityOverrides(
  showId: string,
  selections: OfflineCapacitySelection[]
): Promise<Record<string, boolean>> {
  // MYK9-761: counts from a never-synced show would call a full class open and
  // record the entry as within capacity. The submission surfaces the error.
  await requireShowEntriesSynced(showId);
  // Every count below comes from a device read, and getAll() hands back [] for
  // a failed one: a full class or judge-day would then count as open and the
  // entry be recorded as within capacity, a fact the server keeps (MYK9-772,
  // MYK9-774). A failed read stops the entry with a message the desk can act
  // on instead.
  const [show, classes, trials, assignments, entries] = await Promise.all([
    replicatedShowsTable.getShowById(showId),
    rowsOrThrow(replicatedClassesTable.getAllWithStatus()),
    rowsOrThrow(replicatedTrialsTable.getAllWithStatus()).then(rows =>
      rows
        .filter(trial => trial.showId === showId)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    ),
    readJudgeAssignmentsOrThrow().then(
      rows => rows.filter(a => a.showId === showId),
      () => {
        throw new Error(CAPACITY_UNREADABLE);
      }
    ),
    rowsOrThrow(replicatedEntriesTable.getAllWithStatus()).then(rows =>
      rows.filter(entry => entry.showId === showId)
    ),
  ]);

  return calculateOfflineCapacityOverrides({
    selections,
    classes,
    trials,
    assignments,
    entries,
    defaultJudgeDayCapacity: show?.defaultJudgeDayCapacity ?? 125,
  });
}
