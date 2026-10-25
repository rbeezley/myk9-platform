/**
 * Read-time class judge (MYK9-1327).
 *
 * A class row's judge fields are SERVER-derived: a pull joins them from `judge_assignments`.
 * A secretary's pick is a queued `judge_assignments` write, not a class write, so while that
 * write is undelivered the pulled class row still names the old judge. This overlay puts the
 * picked judge on the rows a reader sees, without storing it on the class row: the replica
 * keeps exactly what the server said, and the moment the assignment is delivered the overlay
 * lets go and the server's own judge shows (which is how another secretary's later change wins).
 *
 * Pure: the caller decides which assignments count as undelivered (it reads the mutation queue).
 * A SYNCED local assignment row is never consulted on its own, because the incremental sync
 * never sees a remote hard delete and a stale row would pin a judge the server dropped.
 */
import type { ReplicatedClass } from './ReplicatedClassesTable';
import type { ReplicatedJudgeAssignment } from './ReplicatedJudgeAssignmentsTable.mapper';

/** A judge's display name in the three shapes a class row carries. */
export interface JudgeDisplayName {
  name: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
}

/** The persisted people source a judge's name is looked up in, by person id. */
export type JudgeNameLookup = (personId: string) => JudgeDisplayName | undefined;

let registeredLookup: JudgeNameLookup | undefined;

/**
 * Registered once at app init (the stores live above services, so services cannot import them).
 * Returns an unregister function that removes only this registration.
 */
export function registerJudgeNameLookup(lookup: JudgeNameLookup): () => void {
  registeredLookup = lookup;
  return () => {
    if (registeredLookup === lookup) registeredLookup = undefined;
  };
}

export function getRegisteredJudgeNameLookup(): JudgeNameLookup | undefined {
  return registeredLookup;
}

/** Which classes the overlay speaks for, and which local assignments are still undelivered. */
export interface ClassJudgeOverlayScope {
  /**
   * Classes this device has unsent judge work for, or whose writes were just acknowledged and
   * whose class row has not been refreshed yet. Only these classes are overlaid: for any other
   * class the server-derived judge on the row is the truth.
   */
  activeClassIds: ReadonlySet<string>;
  /** Assignment rows with an undelivered INSERT or UPDATE: they outrank delivered rows. */
  unsentRowIds: ReadonlySet<string>;
  /**
   * Assignment rows with an undelivered DELETE. A sync can download such a row again (the
   * server still has it); it must not name the class while its removal is waiting.
   */
  deletedRowIds?: ReadonlySet<string> | undefined;
}

/**
 * Undelivered rows first (what this device is still trying to say), then the newest local
 * write; the lowest id breaks an exact tie so the winner never flips between reads.
 */
function compareClaims(scope: ClassJudgeOverlayScope) {
  return (a: ReplicatedJudgeAssignment, b: ReplicatedJudgeAssignment): number => {
    const unsent = Number(scope.unsentRowIds.has(b.id)) - Number(scope.unsentRowIds.has(a.id));
    if (unsent !== 0) return unsent;
    const byTime = (b._lastModified?.getTime() ?? 0) - (a._lastModified?.getTime() ?? 0);
    return byTime !== 0 ? byTime : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

function withJudge(
  cls: ReplicatedClass,
  judge: JudgeDisplayName | undefined,
  judgeId: string | undefined
): ReplicatedClass {
  return {
    ...cls,
    judgeId,
    judgeName: judge?.name,
    judgeFirstName: judge?.firstName,
    judgeLastName: judge?.lastName,
    judgeResolved: true,
  };
}

/**
 * The picked judge's name, never a different judge's: the assignment's own local name, then a
 * server-joined name on any class naming the same person, then the registered people source.
 */
function nameChain(
  classes: readonly ReplicatedClass[],
  lookup: JudgeNameLookup | undefined
): (assignment: ReplicatedJudgeAssignment) => JudgeDisplayName | undefined {
  const joinedNames = new Map<string, JudgeDisplayName>();
  for (const cls of classes) {
    if (cls.judgeId && cls.judgeName && !joinedNames.has(cls.judgeId)) {
      joinedNames.set(cls.judgeId, {
        name: cls.judgeName,
        firstName: cls.judgeFirstName,
        lastName: cls.judgeLastName,
      });
    }
  }
  return assignment =>
    assignment.localJudge ?? joinedNames.get(assignment.personId) ?? lookup?.(assignment.personId);
}

/**
 * Present `classes` with the judge this device means them to have.
 *
 * `assignments` are the local class-level rows of the active classes. For an active class
 * the local rows ARE the device's intent (a pick deletes the old rows and adds the new one, a
 * clear deletes them), so the winning row names the judge and no row means no judge.
 */
export function overlayClassJudges(
  classes: ReplicatedClass[],
  assignments: readonly ReplicatedJudgeAssignment[],
  scope: ClassJudgeOverlayScope,
  lookup: JudgeNameLookup | undefined = registeredLookup
): ReplicatedClass[] {
  const rowsByClass = new Map<string, ReplicatedJudgeAssignment[]>();
  for (const assignment of assignments) {
    if (!assignment.classId || !scope.activeClassIds.has(assignment.classId)) continue;
    if (scope.deletedRowIds?.has(assignment.id)) continue;
    const list = rowsByClass.get(assignment.classId) ?? [];
    list.push(assignment);
    rowsByClass.set(assignment.classId, list);
  }

  const nameFor = nameChain(classes, lookup);
  const compare = compareClaims(scope);
  let changed = false;
  const presented = classes.map(cls => {
    if (!scope.activeClassIds.has(cls.id)) return cls;
    changed = true;
    const winner = rowsByClass.get(cls.id)?.sort(compare)[0];
    return winner
      ? withJudge(cls, nameFor(winner), winner.personId)
      : withJudge(cls, undefined, undefined);
  });
  return changed ? presented : classes;
}
