/**
 * "Scores not sent" (MYK9-2011, owner decision 6 of docs/plan-judge-at-the-ring.md): the one list
 * of every score on this device that has not reached the server. Each row names the dog and
 * armband, the class, the score itself and, when the server refused it, why in plain words.
 *
 * Reached from every count (the header's sync line, the entry list's "not sent" pill and each
 * class card). It replaces the refusal toasts as the place refused scores live. It reads this
 * device only, so it works with no signal and after a reload.
 *
 * INTENT: because each row shows the whole score, the secretary can key it at the desk from the
 * judge's phone. That is what makes it as safe as paper. A row is never removed without a
 * confirmation that names the dog and the score.
 */
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { RingsideUpButton } from '@myk9/ui';
import { useOnlineStatus } from '@/lib/networkUtils';
import { scoresNotSentLabel, type ScoresNotSentLinkState } from './scoresNotSentModel';
import { ScoresNotSentRow } from './ScoresNotSentRow';
import { useUnsentScoreRows } from './useUnsentScores';

export function AtShowScoresNotSentPage() {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const rows = useUnsentScoreRows(showId);
  const isOnline = useOnlineStatus();
  const refused = rows?.filter(row => row.state === 'refused').length ?? 0;

  // Back to the list the count was tapped on; opened directly (a reload, a link), the class list.
  const opener = (useLocation().state as ScoresNotSentLinkState | null)?.scoresNotSentFrom;
  const goBack = () => {
    if (opener) navigate(-1);
    else navigate(`/at-show/${encodeURIComponent(showId ?? '')}`);
  };

  return (
    <main className="ringside-root mx-auto max-w-2xl px-4 py-4">
      <div className="mb-4 flex items-center gap-2">
        <RingsideUpButton label={opener ?? 'Classes'} onClick={goBack} />
      </div>
      <h1 className="text-xl font-semibold">Scores not sent</h1>
      {rows === null ? null : rows.length === 0 ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-base text-success">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
          Every score is sent.
        </p>
      ) : (
        <>
          <p role="status" className="mt-1 text-sm text-muted-foreground">
            {scoresNotSentLabel(rows.length)}.{' '}
            {refused > 0
              ? `${refused} could not be sent. Try again, or score the dog again.`
              : isOnline
                ? 'They are sending by themselves.'
                : 'They send by themselves when there is signal.'}
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map(row => (
              <ScoresNotSentRow key={row.entryId} row={row} isOnline={isOnline} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

export default AtShowScoresNotSentPage;
