import { persistShowJudgeAssignments, saveShowJudgeChanges } from '@/services/database/judges';
import { logger } from '@/services/LoggingService';
import { useWizardStore } from '@/store/wizardStore';

/**
 * Save the wizard's show-level judges after the show itself saved.
 *
 * - A new show only adds its judges.
 * - An edit saves only what changed against `loadedJudges`, the list the edit
 *   started from: replacing the list deleted real judges when it had loaded
 *   empty from a failed device read (MYK9-772).
 *
 * Returns false when the judges could not be saved; the caller warns instead
 * of reporting success (MYK9-769). The show row is already saved either way.
 */
export async function saveWizardShowJudges({
  showId,
  isEdit,
  loadedJudges,
  judges,
}: {
  showId: string;
  isEdit: boolean;
  loadedJudges: ReadonlyArray<{ judgeId: string }>;
  judges: ReadonlyArray<{ judgeId: string }>;
}): Promise<boolean> {
  try {
    if (isEdit) {
      await saveShowJudgeChanges(showId, loadedJudges, judges);
    } else if (judges.length > 0) {
      await persistShowJudgeAssignments(showId, [...judges]);
    }
    return true;
  } catch (judgeError) {
    logger.warn('Failed to persist judge assignments', 'wizard', {
      error: judgeError instanceof Error ? judgeError.message : String(judgeError),
    });
    return false;
  }
}

/**
 * The judge list a wizard EDIT started from: the ids `buildEditModeDraft`
 * recorded when it built the draft. Deliberately NOT the show store's live
 * `assignedJudges`, which can gain judges after the draft was built (they
 * replicate in, or another device adds one); diffing against those would turn
 * judges the draft never showed into removals (MYK9-772).
 */
export function wizardEditJudgeBaseline(): Array<{ judgeId: string }> {
  return (useWizardStore.getState().editBaselineJudgeIds ?? []).map(judgeId => ({ judgeId }));
}
