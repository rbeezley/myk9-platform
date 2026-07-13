import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedJudgeAssignmentsTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';

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

interface OfflineCapacityInput {
  selectedClassIds: string[];
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
  selectedClassIds,
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

  for (const assignment of assignments) {
    if (assignment.status !== 'confirmed' || !assignment.classId) continue;
    const current = assignmentsByClass.get(assignment.classId) ?? [];
    current.push(assignment);
    assignmentsByClass.set(assignment.classId, current);
  }

  return Object.fromEntries(
    selectedClassIds.map(classId => {
      const entryClass = classesById.get(classId);
      const classCount = consumingEntries.filter(entry => entry.classId === classId).length;
      const classFull =
        (entryClass?.maxEntries ?? 0) > 0 && classCount >= (entryClass?.maxEntries ?? 0);
      const classAssignments = assignmentsByClass.get(classId) ?? [];
      const trialDate = entryClass?.trialId ? trialDates.get(entryClass.trialId) : undefined;

      const judgeDayFull = classAssignments.some(assignment => {
        if (!trialDate) return false;
        const judgeClassIds = new Set(
          assignments
            .filter(candidate => {
              if (candidate.status !== 'confirmed' || candidate.personId !== assignment.personId) {
                return false;
              }
              const candidateClass = candidate.classId
                ? classesById.get(candidate.classId)
                : undefined;
              return candidateClass?.trialId
                ? trialDates.get(candidateClass.trialId) === trialDate
                : false;
            })
            .flatMap(candidate => (candidate.classId ? [candidate.classId] : []))
        );
        const judgeDayCount = consumingEntries.filter(entry =>
          entry.classId ? judgeClassIds.has(entry.classId) : false
        ).length;
        const configuredOverrides = assignments
          .filter(candidate => {
            if (candidate.status !== 'confirmed' || candidate.personId !== assignment.personId) {
              return false;
            }
            const candidateClass = candidate.classId
              ? classesById.get(candidate.classId)
              : undefined;
            return candidateClass?.trialId
              ? trialDates.get(candidateClass.trialId) === trialDate
              : false;
          })
          .flatMap(candidate =>
            candidate.dayCapacityOverride == null ? [] : [candidate.dayCapacityOverride]
          );
        const judgeDayCapacity =
          configuredOverrides.length > 0 ? Math.max(...configuredOverrides) : defaultJudgeDayCapacity;
        return judgeDayCount >= judgeDayCapacity;
      });

      return [classId, classFull || judgeDayFull];
    })
  );
}

export async function loadOfflineCapacityOverrides(
  showId: string,
  selectedClassIds: string[]
): Promise<Record<string, boolean>> {
  const [show, classes, trials, assignments, entries] = await Promise.all([
    replicatedShowsTable.getShowById(showId),
    replicatedClassesTable.getAll(),
    replicatedTrialsTable.getTrialsByShow(showId),
    replicatedJudgeAssignmentsTable.getByShowId(showId),
    replicatedEntriesTable.getEntriesByShow(showId),
  ]);

  return calculateOfflineCapacityOverrides({
    selectedClassIds,
    classes,
    trials,
    assignments,
    entries,
    defaultJudgeDayCapacity: show?.defaultJudgeDayCapacity ?? 125,
  });
}
