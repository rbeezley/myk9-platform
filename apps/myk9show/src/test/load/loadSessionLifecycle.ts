import type { LoadSessionAssignment } from './loadAssignments';

export interface LoadSessionActivityInterval {
  sequence: number;
  ringside: boolean;
  startedAtMs: number;
  finishedAtMs: number;
}

export interface LoadSessionLifecycleObservation {
  configuredSessions: number;
  preparedSessions: number;
  startedWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  peakActiveWorkflows: number;
  configuredRingsideSessions: number;
  preparedRingsideSessions: number;
  startedRingsideWorkflows: number;
  completedRingsideWorkflows: number;
  failedRingsideWorkflows: number;
  peakActiveRingsideWorkflows: number;
  activityIntervals: readonly LoadSessionActivityInterval[];
}

export class LoadSessionLifecycle {
  private readonly assignments: Map<number, LoadSessionAssignment>;
  private readonly prepared = new Set<number>();
  private readonly started = new Set<number>();
  private readonly completed = new Set<number>();
  private readonly failed = new Set<number>();
  private readonly startedAtMs = new Map<number, number>();
  private readonly activityIntervals: LoadSessionActivityInterval[] = [];
  private readonly now: () => number;
  private activeWorkflows = 0;
  private activeRingsideWorkflows = 0;

  constructor(
    assignments: readonly LoadSessionAssignment[],
    now: () => number = highResolutionEpochMs
  ) {
    this.assignments = new Map(assignments.map(assignment => [assignment.sequence, assignment]));
    this.now = now;
    if (this.assignments.size !== assignments.length) {
      throw new Error('Load session assignments must have unique sequences.');
    }
  }

  markPrepared(assignments: readonly LoadSessionAssignment[]): void {
    for (const assignment of assignments) {
      this.assertConfigured(assignment);
      this.prepared.add(assignment.sequence);
    }
  }

  markStarted(assignment: LoadSessionAssignment): void {
    this.assertConfigured(assignment);
    if (!this.prepared.has(assignment.sequence)) {
      throw new Error(`Session ${assignment.sequence} started before preparation.`);
    }
    if (this.started.has(assignment.sequence)) {
      throw new Error(`Session ${assignment.sequence} started more than once.`);
    }
    this.started.add(assignment.sequence);
    this.startedAtMs.set(assignment.sequence, this.now());
    this.activeWorkflows += 1;
    if (isRingside(assignment)) {
      this.activeRingsideWorkflows += 1;
    }
  }

  markCompleted(assignment: LoadSessionAssignment): void {
    this.finish(assignment, this.completed, 'completed');
  }

  markFailed(assignment: LoadSessionAssignment): void {
    this.finish(assignment, this.failed, 'failed');
  }

  observation(): LoadSessionLifecycleObservation {
    const configured = [...this.assignments.values()];
    const peaks = calculatePeakActiveWorkflows(this.activityIntervals);
    return {
      configuredSessions: configured.length,
      preparedSessions: this.prepared.size,
      startedWorkflows: this.started.size,
      completedWorkflows: this.completed.size,
      failedWorkflows: this.failed.size,
      peakActiveWorkflows: peaks.total,
      configuredRingsideSessions: countRingside(configured),
      preparedRingsideSessions: countSequences(this.prepared, this.assignments, isRingside),
      startedRingsideWorkflows: countSequences(this.started, this.assignments, isRingside),
      completedRingsideWorkflows: countSequences(this.completed, this.assignments, isRingside),
      failedRingsideWorkflows: countSequences(this.failed, this.assignments, isRingside),
      peakActiveRingsideWorkflows: peaks.ringside,
      activityIntervals: [...this.activityIntervals],
    };
  }

  private finish(
    assignment: LoadSessionAssignment,
    destination: Set<number>,
    outcome: 'completed' | 'failed'
  ): void {
    this.assertConfigured(assignment);
    if (!this.started.has(assignment.sequence)) {
      throw new Error(`Session ${assignment.sequence} ${outcome} before it started.`);
    }
    if (this.completed.has(assignment.sequence) || this.failed.has(assignment.sequence)) {
      throw new Error(`Session ${assignment.sequence} finished more than once.`);
    }
    destination.add(assignment.sequence);
    const startedAtMs = this.startedAtMs.get(assignment.sequence);
    if (startedAtMs === undefined) {
      throw new Error(`Session ${assignment.sequence} is missing its start timestamp.`);
    }
    this.activityIntervals.push({
      sequence: assignment.sequence,
      ringside: isRingside(assignment),
      startedAtMs,
      finishedAtMs: Math.max(startedAtMs, this.now()),
    });
    this.activeWorkflows -= 1;
    if (isRingside(assignment)) this.activeRingsideWorkflows -= 1;
  }

  private assertConfigured(assignment: LoadSessionAssignment): void {
    if (this.assignments.get(assignment.sequence) !== assignment) {
      throw new Error(`Session ${assignment.sequence} is not part of this load shard.`);
    }
  }
}

export function calculatePeakActiveWorkflows(intervals: readonly LoadSessionActivityInterval[]): {
  total: number;
  ringside: number;
} {
  const events = intervals
    .flatMap(interval => [
      { atMs: interval.startedAtMs, totalDelta: 1, ringsideDelta: interval.ringside ? 1 : 0 },
      { atMs: interval.finishedAtMs, totalDelta: -1, ringsideDelta: interval.ringside ? -1 : 0 },
    ])
    .sort(
      (left, right) =>
        left.atMs - right.atMs ||
        // Treat intervals as half-open: a finish at t does not overlap a start at t.
        left.totalDelta - right.totalDelta
    );
  let active = 0;
  let activeRingside = 0;
  let peak = 0;
  let peakRingside = 0;
  for (const event of events) {
    active += event.totalDelta;
    activeRingside += event.ringsideDelta;
    peak = Math.max(peak, active);
    peakRingside = Math.max(peakRingside, activeRingside);
  }
  return { total: peak, ringside: peakRingside };
}

function isRingside(assignment: LoadSessionAssignment): boolean {
  return assignment.kind === 'ringside-scoring';
}

function countRingside(assignments: readonly LoadSessionAssignment[]): number {
  return assignments.filter(isRingside).length;
}

function countSequences(
  sequences: ReadonlySet<number>,
  assignments: ReadonlyMap<number, LoadSessionAssignment>,
  predicate: (assignment: LoadSessionAssignment) => boolean
): number {
  let count = 0;
  for (const sequence of sequences) {
    const assignment = assignments.get(sequence);
    if (assignment && predicate(assignment)) count += 1;
  }
  return count;
}

function highResolutionEpochMs(): number {
  return performance.timeOrigin + performance.now();
}
