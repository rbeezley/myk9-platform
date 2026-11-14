import { replicatedEntriesTable } from '@/services/replication';
import {
  SCORE_DETAIL_CLEAR_FIELDS,
  scoreResetCheckInFields,
} from '@/services/replication/scoreResetFields';

/**
 * Clear an entry's score back to unscored and pending, and a `completed` check-in with it, in one
 * replicated write. The judge's Reset score and Show Desk's Undo of Mark absent both call this, so
 * the way back from a result is one write.
 *
 * There is no `protect_scored_entries` trigger (verified absent), so no unlock step is needed. All
 * cleared columns are ringside-whitelisted, so `updateEntryWith` auto-routes through
 * `ringside_update_entry`, letting an assigned judge reset as well as a manager. The scoring-state
 * trigger clears any stale placement. The nullable field variants (camel `finalPlacement`, snake
 * `scoring_completed_at`, `disqualification_reason`) make the clears persist as NULL.
 */
export async function clearEntryScore(entryId: string): Promise<void> {
  await replicatedEntriesTable.updateEntryWith(entryId, current => ({
    isScored: false,
    is_scored: false,
    resultStatus: 'pending',
    result_status: 'pending',
    searchTimeSeconds: 0,
    search_time_seconds: 0,
    totalFaults: 0,
    total_faults: 0,
    finalPlacement: null,
    scoringCompletedAt: null,
    scoring_completed_at: null,
    disqualification_reason: null,
    ...SCORE_DETAIL_CLEAR_FIELDS,
    ...scoreResetCheckInFields(current),
  }));
}
