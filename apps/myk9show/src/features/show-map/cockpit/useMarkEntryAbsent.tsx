import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { ABSENT_SCORE } from '@/features/at-show/absentScore';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { toOptimisticScorePayload } from '@/pages/scoring/types';

import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';

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
  onRefreshEntries,
}: {
  classId: string;
  className: string;
  onRefreshEntries?: (() => void | Promise<void>) | undefined;
}): { request: (entry: SecretaryCockpitClassEntry) => void; dialog: ReactNode } {
  const { submitScoreOptimistically } = useOptimisticScoring();
  const [pending, setPending] = useState<SecretaryCockpitClassEntry | null>(null);

  const confirm = async () => {
    const entry = pending;
    setPending(null);
    if (!entry) return;
    const label = absentDogLabel(entry);
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
      toast.success(`${label} marked absent.`);
      await onRefreshEntries?.();
    } else {
      toast.error(outcome.failure ? `Not saved: ${outcome.failure}` : 'Not saved. Try again.');
    }
  };

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
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
