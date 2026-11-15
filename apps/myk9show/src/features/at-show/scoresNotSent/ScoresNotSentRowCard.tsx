/**
 * One dog on the Scores not sent list (MYK9-2011): who, which class, the score itself and why.
 * A refused score offers Try again; removing it asks first and names the dog and the score,
 * because removing deletes the only copy.
 */
import { useState } from 'react';
import { AlertCircle, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { announceUnsentChanged } from '@/hooks/useUnsentWork';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import type { ScoresNotSentRow } from './useScoresNotSent';
import { removeScoreDescription } from './unsentScoreDetails';

export function ScoresNotSentRowCard({ row }: { row: ScoresNotSentRow }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (run: (id: string) => Promise<void>) => {
    setBusy(true);
    try {
      await Promise.allSettled(row.failedMutationIds.map(run));
    } finally {
      announceUnsentChanged();
      setBusy(false);
    }
  };

  return (
    <li
      data-testid="score-not-sent-row"
      className={`rounded-xl border bg-card p-4 shadow-sm ${row.refused ? 'border-destructive/40' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-base font-semibold text-foreground">{row.dogLabel}</p>
        {row.className && <p className="text-sm text-muted-foreground">{row.className}</p>}
      </div>
      <p className="mt-1 text-base text-foreground">{row.scoreText}</p>
      {row.scoreReason && (
        <p className="text-sm text-muted-foreground">Reason: {row.scoreReason}</p>
      )}
      <p
        className={`mt-2 flex items-start gap-2 text-sm ${
          row.refused ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {row.refused ? (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <CloudUpload className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <span>{row.why}</span>
      </p>
      {row.refused && !row.canAct && (
        <p className="mt-2 text-sm text-muted-foreground">
          Saved under an earlier sign-in on this phone. Show this score to the secretary.
        </p>
      )}
      {row.refused && row.canAct && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11 px-4"
            disabled={busy}
            onClick={() => void act(id => mutationManager.retryFailedMutation(id))}
          >
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-4"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Remove
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove the score for ${row.dogLabel}?`}
        description={removeScoreDescription(row)}
        confirmLabel="Remove score"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => void act(id => mutationManager.discardFailedMutation(id))}
      />
    </li>
  );
}
