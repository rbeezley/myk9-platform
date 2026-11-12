import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { isRunnableEntry } from '@/features/_shared/entryAccounting';
import { ABSENT_SCORE } from '@/features/at-show/absentScore';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { toOptimisticScorePayload } from '@/pages/scoring/types';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { transitionToCompleted } from '@/utils/checkInTransitions';

import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';
import { canMarkAbsent } from './entryRowLinks';
import type { CockpitLifecycle } from './secretaryCockpitTypes';

/** The dog's label in the confirm and the toast: `#110 Hazel`, or the call name alone. */
export function absentDogLabel(entry: Pick<SecretaryCockpitClassEntry, 'armband' | 'dogName'>) {
  return entry.armband ? `#${entry.armband} ${entry.dogName}` : entry.dogName;
}

/**
 * Mark absent from the entries table (MYK9-1873). Absent is a RESULT, not a check-in status: this
 * submits the same `ABSENT_SCORE` Ringside's held-entry notice does, through the scoresheet's
 * offline-first score write, after a confirm because it settles the dog's run.
 */
export function useMarkEntryAbsent({
  classId,
  className,
  entries,
  classLifecycle,
  onRefreshEntries,
}: {
  classId: string;
  className: string;
  /** The table's rows now: the dialog closes when its dog stops being one that can be marked absent. */
  entries: readonly SecretaryCockpitClassEntry[];
  classLifecycle: CockpitLifecycle | null;
  onRefreshEntries?: (() => void | Promise<void>) | undefined;
}): { request: (entry: SecretaryCockpitClassEntry) => void; dialog: ReactNode } {
  const { submitScoreOptimistically } = useOptimisticScoring();
  const [pending, setPending] = useState<SecretaryCockpitClassEntry | null>(null);

  // The row as the table reads it now: a dog scored, pulled or moved on while the dialog was open
  // no longer offers Mark absent, so the dialog goes with it.
  const live = pending ? entries.find(row => row.nodeId === pending.nodeId) : undefined;
  const open = live !== undefined && canMarkAbsent(live, classLifecycle);

  const confirm = async () => {
    const entry = live;
    setPending(null);
    if (!entry) return;
    const label = absentDogLabel(entry);
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
      toast.success(`${label} marked absent.`);
      await onRefreshEntries?.();
    } else {
      toast.error(outcome.failure ? `Not saved: ${outcome.failure}` : 'Not saved. Try again.');
    }
  };

  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={open => {
        if (!open) setPending(null);
      }}
      title={pending ? `Mark ${absentDogLabel(pending)} absent?` : 'Mark absent?'}
      description="This records Absent as the dog's result for this class."
      confirmLabel="Mark absent"
      onConfirm={() => void confirm()}
    />
  );

  return { request: setPending, dialog };
}
