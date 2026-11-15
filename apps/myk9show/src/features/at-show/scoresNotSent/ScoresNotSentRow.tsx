import { useState } from 'react';
import { AlertCircle, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { describeRefusal } from './scoresNotSentReason';
import { describeUnsentScore } from './scoresNotSentScore';
import { removeUnsentScore, retryUnsentScore, type UnsentScoreRow } from './useUnsentScores';

/** One dog on "Scores not sent": who, which class, the score, and why it is here. */
export function ScoresNotSentRow({ row, isOnline }: { row: UnsentScoreRow; isOnline: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const score = describeUnsentScore(row.fields).join(' · ');
  const refused = row.state === 'refused';

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    void action().finally(() => setBusy(false));
  };

  return (
    <li
      data-testid="scores-not-sent-row"
      data-state={row.state}
      className="rounded-lg border border-border bg-card p-3"
    >
      <p className="text-base font-semibold">{row.dogLabel}</p>
      {row.className && <p className="text-sm text-muted-foreground">{row.className}</p>}
      {score && <p className="mt-1 text-base">{score}</p>}
      <p
        className={`mt-2 flex items-start gap-1.5 text-sm ${
          refused ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {refused ? (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <CloudUpload className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <span>
          {refused
            ? `Could not be sent. ${describeRefusal(row.refusal)}`
            : isOnline
              ? 'Not sent yet. It keeps trying by itself.'
              : 'Not sent yet. It sends by itself when there is signal.'}
        </span>
      </p>
      {refused && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11 px-4"
            disabled={busy}
            onClick={() => run(() => retryUnsentScore(row))}
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
        description={`${score ? `${score}. ` : ''}This score has not reached myK9Show. Removing it deletes it from this device, and the dog will need to be scored again.`}
        confirmLabel="Remove score"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => run(() => removeUnsentScore(row))}
      />
    </li>
  );
}
