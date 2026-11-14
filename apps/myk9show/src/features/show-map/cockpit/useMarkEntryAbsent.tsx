import { toast } from 'sonner';

import { isRunnableEntry } from '@/features/_shared/entryAccounting';
import { ABSENT_SCORE } from '@/features/at-show/absentScore';
import { clearEntryScore } from '@/features/at-show/clearEntryScore';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { STATUS_UNDO_WINDOW_MS, showUndoToast } from '@/lib/undoToast';
import { toOptimisticScorePayload } from '@/pages/scoring/types';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { transitionToCompleted } from '@/utils/checkInTransitions';

import { dayOfDogLabel, markedAbsentMessage } from '../dayOfMessages';
import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';

/**
 * Mark absent from the entries table (MYK9-1873, MYK9-1940). Absent is a RESULT, not a check-in
 * status: this submits the same `ABSENT_SCORE` Ringside's held-entry notice does, through the
 * scoresheet's offline-first score write. One tap, no confirmation: the toast says what happened
 * and its Undo clears the result with the same write the judge's Reset score uses.
 */
export function useMarkEntryAbsent({
  classId,
  className,
  onRefreshEntries,
}: {
  classId: string;
  className: string;
  onRefreshEntries?: (() => void | Promise<void>) | undefined;
}): { request: (entry: SecretaryCockpitClassEntry) => void } {
  const { submitScoreOptimistically } = useOptimisticScoring();

  const undo = async (entry: SecretaryCockpitClassEntry, label: string) => {
    try {
      await clearEntryScore(entry.entryId);
      await onRefreshEntries?.();
    } catch {
      toast.error(`Could not undo ${label} marked absent in ${className}. Try again.`);
    }
  };

  const request = async (entry: SecretaryCockpitClassEntry) => {
    const label = dayOfDogLabel(entry);
    // The table's row can trail a score saved on another device. Re-read the replica (the store
    // the score write goes to) so an absent never overwrites a real result.
    let stillRunnable = false;
    try {
      const stored = await replicatedEntriesTable.get(entry.entryId);
      stillRunnable = stored !== null && isRunnableEntry(stored);
    } catch {
      toast.error(`Could not check ${label} just now; nothing was changed. Try again.`);
      return;
    }
    if (!stillRunnable) {
      toast.error(`${label} was scored while this was open; nothing was changed.`);
      return;
    }
    const outcome: { saved: boolean; failure: string | null } = { saved: false, failure: null };
    await submitScoreOptimistically({
      entryId: entry.entryId,
      classId,
      armband: entry.queue.armband ?? 0,
      className,
      scoreData: toOptimisticScorePayload(ABSENT_SCORE),
      onSuccess: () => {
        outcome.saved = true;
      },
      onError: error => {
        outcome.failure = error.message;
      },
    });
    if (outcome.saved) {
      // As the scoresheet does after a score: a dog that was in the ring leaves it.
      if (entry.state === 'in-ring') transitionToCompleted(entry.entryId);
      showUndoToast({
        message: markedAbsentMessage(label, className),
        onUndo: () => void undo(entry, label),
        duration: STATUS_UNDO_WINDOW_MS,
      });
      await onRefreshEntries?.();
    } else {
      toast.error(outcome.failure ? `Not saved: ${outcome.failure}` : 'Not saved. Try again.');
    }
  };

  return { request: entry => void request(entry) };
}
