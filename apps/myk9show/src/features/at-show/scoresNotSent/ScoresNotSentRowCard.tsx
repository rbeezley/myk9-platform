/**
 * One dog on the Scores not sent list (MYK9-2011): who, which class, every saved score field
 * and why. A refused score offers Try again, which resends only the newest version of it.
 * Removing asks first and names the dog and the score, because removing deletes the only copy,
 * and it removes only the score: a refused check-in or ring change on the same dog is kept.
 */
import { useState } from 'react';
import { AlertCircle, CloudUpload, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { announceUnsentChanged } from '@/hooks/useUnsentWork';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import type { ScoresNotSentRow } from './useScoresNotSent';
import { removeScoreDescription } from './unsentScoreDetails';

export function ScoresNotSentRowCard({ row }: { row: ScoresNotSentRow }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const refused = row.state === 'refused';
  const needsPerson = row.state !== 'waiting';

  const act = async (ids: readonly string[], run: (id: string) => Promise<void>) => {
    setBusy(true);
    try {
      await Promise.allSettled(ids.map(run));
    } finally {
      announceUnsentChanged();
      setBusy(false);
    }
  };

  const Icon = refused ? AlertCircle : row.state === 'superseded' ? History : CloudUpload;

  return (
    <li
      data-testid="score-not-sent-row"
      data-state={row.state}
      className={`rounded-xl border bg-card p-4 shadow-sm ${refused ? 'border-destructive/40' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-base font-semibold text-foreground">{row.dogLabel}</p>
        {row.className && <p className="text-sm text-muted-foreground">{row.className}</p>}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-base">
        {row.scoreRows.map(item => (
          <div key={item.label} className="contents">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-medium tabular-nums text-foreground">{item.value}</dd>
          </div>
        ))}
        {row.scoreReason && (
          <div className="contents">
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="text-foreground">{row.scoreReason}</dd>
          </div>
        )}
      </dl>
      <p
        className={`mt-2 flex items-start gap-2 text-sm ${
          refused ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{row.why}</span>
      </p>
      {row.hasOtherRefusedChange && (
        <p className="mt-2 text-sm text-muted-foreground">
          A check-in or ring change for this dog was not sent either. It is kept separately and is
          not removed with this score.
        </p>
      )}
      {needsPerson && !row.canAct && (
        <p className="mt-2 text-sm text-muted-foreground">
          Saved under an earlier sign-in on this phone. Show this score to the secretary.
        </p>
      )}
      {needsPerson && row.canAct && (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.retryIds.length > 0 && (
            <Button
              type="button"
              className="min-h-11 px-4"
              disabled={busy}
              onClick={() => void act(row.retryIds, id => mutationManager.retryFailedMutation(id))}
            >
              Try again
            </Button>
          )}
          {row.removeIds.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-4"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Remove
            </Button>
          )}
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
        onConfirm={() => void act(row.removeIds, id => mutationManager.discardFailedMutation(id))}
      />
    </li>
  );
}
