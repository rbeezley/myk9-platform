/** Operational class-state derivation. Presentation belongs to @myk9/ui's status grammar. */

export type ClassStatus =
  | 'setup'
  | 'briefing'
  | 'break'
  | 'start_time'
  | 'in_progress'
  | 'offline-scoring'
  | 'completed'
  | 'no-status';

/**
 * Minimal dog/entry shape the class-status detectors need.
 */
export interface ClassDog {
  in_ring?: boolean;
  is_scored?: boolean;
  checkin_status?: number;
  armband_number?: string;
  call_name?: string;
}

/**
 * Minimal class-row shape the status detectors need. Named distinctly
 * from `pages/ClassList/types.ts`'s `ClassEntry` (the full fetched
 * row) to keep the two concepts unambiguous in the package.
 *
 * Callers passing the richer page `ClassEntry` work via structural
 * typing — the wider object satisfies this narrower contract.
 */
export interface ClassStatusInput {
  id: string;
  class_status: ClassStatus;
  is_scoring_finalized?: boolean;
  entry_count: number;
  completed_count: number;
  dogs: ClassDog[];
  briefing_time?: string | null;
  break_until?: string | null;
  start_time?: string | null;
}

/**
 * Detects a class's display status by combining the persisted
 * `class_status` field with completion + in-ring activity.
 *
 * Priority order (deliberate):
 *   1. `is_scoring_finalized === true` → 'completed'
 *   2. Manual `class_status === 'completed' | 'in_progress'`
 *   3. Auto-detection only when class_status is 'no-status'
 *      (manual statuses like setup/briefing/break/start_time are
 *      respected and never overridden by activity)
 */
export function getClassDisplayStatus(
  classEntry: ClassStatusInput
): 'not-started' | 'in-progress' | 'completed' {
  // PRIORITY 1: Check is_scoring_finalized field. The server sets this
  // authoritatively when `refresh_class_scoring_state()` writes 'completed'
  // (expected/accounted-for predicate that excludes scratched/withdrawn/
  // pulled entries — see openspec/changes/class-status-auto-derivation
  // design.md Decision 2/5). Deferring to it here means a client whose
  // local entry snapshot is mid-sync never contradicts a server-completed
  // class.
  if (classEntry.is_scoring_finalized === true) {
    return 'completed';
  }

  // PRIORITY 2: Manual class_status always wins (for run order only usage)
  if (classEntry.class_status === 'completed') {
    return 'completed';
  }
  if (classEntry.class_status === 'in_progress') {
    return 'in-progress';
  }

  // PRIORITY 3: Only use automatic detection if class_status is 'no-status'
  // Manual statuses like setup, briefing, break, start_time should always be respected
  if (classEntry.class_status === 'no-status') {
    // Intentionally NOT deriving "completed" from
    // `completed_count === entry_count`: `ClassStatusInput`/`ClassDog`
    // carry no per-entry scratch/withdrawn/pulled state, so raw-count
    // equality can't apply the server's expected/accounted-for exclusion.
    // A scratched-but-unscored entry would hold completed_count below
    // entry_count forever and wrongly render "in progress" for a class the
    // server already marked completed. Rely on is_scoring_finalized /
    // manual class_status above for the completed verdict instead
    // (Decision 5).
    // A class is in progress if it has dogs in the ring or some scored
    if (classEntry.dogs.some(dog => dog.in_ring) || classEntry.completed_count > 0) {
      return 'in-progress';
    }
  }

  return 'not-started';
}

export type EffectiveClassStatus = ClassStatus | 'in-progress';

/** Resolve stored state plus scoring activity into the status key the UI should render. */
export function getEffectiveClassStatus(classEntry: ClassStatusInput): EffectiveClassStatus {
  if (classEntry.class_status === 'offline-scoring') {
    return 'offline-scoring';
  }

  const displayStatus = getClassDisplayStatus(classEntry);
  if (displayStatus === 'completed') return 'completed';
  if (displayStatus === 'in-progress') return 'in-progress';
  return classEntry.class_status;
}
