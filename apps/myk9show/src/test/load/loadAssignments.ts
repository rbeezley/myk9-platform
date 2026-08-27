import {
  loadRingAssignment,
  LOAD_SHOWS,
  LOAD_TOTAL_RING_COUNT,
  type LoadRingAssignment,
} from './loadFixture';
import type { LoadRole, LoadScenario, LoadWorkloadKind } from './loadScenario';

/**
 * Where a session acts. Sessions carry their target rather than deriving one from
 * their index, because index-derived placement is what produced the invalid
 * workload: `(entryNumber - 1) % 8` silently put roughly seven scorers on every
 * class. Placement is decided here, once, per workload kind.
 */
export interface LoadSessionTarget {
  readonly showIndex: number;
  readonly showId: string;
  readonly trialId: string;
  readonly classId: string;
  /** Ring position within its own show. */
  readonly ringIndex: number;
  /** The entry this session first acts on. Scoring sessions walk on from here. */
  readonly entryNumber: number;
}

export interface LoadSessionAssignment {
  kind: LoadWorkloadKind;
  /**
   * Carried from the workload so the runner selects credentials from the role
   * itself. A separate kind-to-credential list would silently drift from the
   * declared role, which is how exhibitor work ends up running as staff.
   */
  role: LoadRole;
  index: number;
  sequence: number;
  target: LoadSessionTarget;
}

/**
 * Check-in sessions work from the end of the dog list while scoring works from
 * the start, so an exhibitor checking in never collides with the dog a judge is
 * scoring. The one deliberate collision is `scoring-correction`, which is the
 * point of that workload.
 */
const CHECK_IN_FIRST_DOG_FROM_END = 0;

function entryNumberFor(ring: LoadRingAssignment, dogNumber: number): number {
  const show = LOAD_SHOWS[ring.showIndex];
  return (dogNumber - 1) * show.ringCount + ring.ringIndex + 1;
}

function target(ring: LoadRingAssignment, dogNumber: number): LoadSessionTarget {
  return {
    showIndex: ring.showIndex,
    showId: ring.showId,
    trialId: ring.trialId,
    classId: ring.classId,
    ringIndex: ring.ringIndex,
    entryNumber: entryNumberFor(ring, dogNumber),
  };
}

/** The first ring of a given show, used by per-show workloads. */
function firstRingOfShow(showIndex: number): LoadRingAssignment {
  let ordinal = 0;
  for (const show of LOAD_SHOWS) {
    if (show.index === showIndex) return loadRingAssignment(ordinal);
    ordinal += show.ringCount;
  }
  /* c8 ignore next -- every show index comes from LOAD_SHOWS itself. */
  throw new Error(`Unknown show index ${showIndex}.`);
}

/**
 * Placement per workload kind. Every writer targets a class that is concurrently
 * being scored — spreading them over idle classes would measure nothing, because
 * contention is the property under test.
 */
function targetFor(kind: LoadWorkloadKind, index: number): LoadSessionTarget {
  switch (kind) {
    // One session per ring, each on a distinct class. Starts at dog 1.
    case 'ringside-scoring':
      return target(loadRingAssignment(index % LOAD_TOTAL_RING_COUNT), 1);

    // Deliberate optimistic-concurrency collision: one per show, on the same
    // entry that show's first ring is scoring. This is the realistic case of two
    // writers on one entry — a secretary correcting behind the judge.
    case 'scoring-correction':
      return target(firstRingOfShow(index % LOAD_SHOWS.length), 1);

    // One per ring, on the class that ring is scoring. Works from the last dog
    // backwards so it contends on the class row without colliding on an entry.
    case 'steward-check-in': {
      const ring = loadRingAssignment(index % LOAD_TOTAL_RING_COUNT);
      const dogs = LOAD_SHOWS[ring.showIndex].dogCount;
      return target(ring, dogs - CHECK_IN_FIRST_DOG_FROM_END);
    }

    // Spread across every ring, so each actively-scored class sees more than one
    // check-in writer during its opening burst.
    case 'exhibitor-check-in': {
      const ring = loadRingAssignment(index % LOAD_TOTAL_RING_COUNT);
      const dogs = LOAD_SHOWS[ring.showIndex].dogCount;
      const lap = Math.floor(index / LOAD_TOTAL_RING_COUNT) + 1;
      return target(ring, Math.max(1, dogs - lap));
    }

    // One secretary per show, editing a class while it is being scored. The only
    // lock holder that never reaches the class row through the entries trigger.
    case 'secretary-class-edit':
      return target(firstRingOfShow(index % LOAD_SHOWS.length), 1);

    case 'run-order-read':
      return target(loadRingAssignment(index % LOAD_TOTAL_RING_COUNT), 1);

    case 'exhibitor-read':
    case 'operations-read':
      return target(firstRingOfShow(index % LOAD_SHOWS.length), 1);
  }
}

export function buildSessionAssignments(
  scenario: LoadScenario,
  smoke = false
): LoadSessionAssignment[] {
  const assignments: LoadSessionAssignment[] = [];
  for (const workload of scenario.workloads) {
    const sessions = smoke ? 1 : workload.sessions;
    for (let index = 0; index < sessions; index += 1) {
      assignments.push({
        kind: workload.kind,
        role: workload.role,
        index,
        sequence: assignments.length,
        target: targetFor(workload.kind, index),
      });
    }
  }
  return assignments;
}

/**
 * Distinct classes touched by scoring. Asserting this equals the ring count is
 * how the one-scorer-per-class invariant is enforced against regression.
 */
export function scoringClassIds(assignments: readonly LoadSessionAssignment[]): string[] {
  return assignments
    .filter(assignment => assignment.kind === 'ringside-scoring')
    .map(assignment => assignment.target.classId);
}
