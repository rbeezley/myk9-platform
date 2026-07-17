import { CLASS_STATUS, normalizeClassStatus } from '../constants/class-status';

export type ClassDisplayStatus = 'not-started' | 'in-progress' | 'completed';

/**
 * Draft shows render no class lifecycle chips at all — "Not started" on a
 * show that isn't published yet is status noise (UX walk remediation 2.B(1)).
 * Only an affirmative `'draft'` hides chips: cold-store rows with no show
 * status keep their chips (ringside must not lose state while syncing).
 */
export function shouldShowClassLifecycleChips(showStatus: string | null | undefined): boolean {
  return showStatus !== 'draft';
}

export interface ClassDisplayStatusInput {
  status?: string;
  is_scoring_finalized?: boolean;
  entry_count: number;
  scored_count: number;
  has_active_entries?: boolean;
}

export function getClassDisplayStatus(input: ClassDisplayStatusInput): ClassDisplayStatus {
  // Rows reach this helper with either the display spellings ('Completed') or
  // the raw classes_status_check spellings ('completed' / 'in_progress' /
  // 'setup'); normalize once so both hit the checks below.
  const status = input.status ? normalizeClassStatus(input.status) : undefined;

  // Priority 1: Finalized flag. The server sets `is_scoring_finalized`
  // authoritatively when `refresh_class_scoring_state()` writes 'completed'
  // (expected/accounted-for predicate that excludes scratched/withdrawn/
  // pulled entries — see openspec/changes/class-status-auto-derivation
  // design.md Decision 2/5). Deferring to it here means a client whose local
  // entry snapshot is mid-sync — e.g. still shows scored_count < entry_count
  // because a scratch or scoring row hasn't synced yet — never renders
  // "in progress" for a class the server already completed.
  if (input.is_scoring_finalized === true) {
    return 'completed';
  }

  // Priority 2: Canonical server status.
  if (status === CLASS_STATUS.COMPLETED) {
    return 'completed';
  }

  // Intentionally NOT deriving "completed" from
  // `scored_count === entry_count`: this input shape carries only
  // pre-aggregated counts, no per-entry scratch/withdrawn/pulled state, so
  // raw-count equality can't apply the server's expected/accounted-for
  // exclusion. A scratched-but-unscored entry would hold scored_count below
  // entry_count forever and wrongly render "in progress" for a class the
  // server already marked completed. Rely on is_scoring_finalized / status
  // above for the completed verdict instead (Decision 5).

  // Priority 3: In Progress status or active scoring
  if (status === CLASS_STATUS.IN_PROGRESS) {
    return 'in-progress';
  }

  if (input.has_active_entries || input.scored_count > 0) {
    return 'in-progress';
  }

  // Default
  return 'not-started';
}
