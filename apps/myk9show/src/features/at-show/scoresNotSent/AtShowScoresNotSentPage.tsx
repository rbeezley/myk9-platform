/**
 * Scores not sent (MYK9-2011, owner decision 6): the one list of every score on this phone
 * that has not reached the server, waiting or refused. Reached from the count in the header
 * and on each class card. It replaces the refusal toasts as the place a refused score lives.
 *
 * Offline-first: every row is read from this device (IndexedDB), never from the server, so it
 * works with no signal and survives a reload or a new passcode. Each row shows the score
 * itself, so the secretary can key it at the desk from the judge's phone: as safe as paper.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { RingsideUpButton } from '@myk9/ui';
import { Button } from '@/components/ui/button';
import { useRingsideTrip } from '../menu/useRingsideTrip';
import { atShowScoresNotSentPath } from './scoresNotSentPath';
import { ScoresNotSentRowCard } from './ScoresNotSentRowCard';
import { useScoresNotSent } from './useScoresNotSent';

export function AtShowScoresNotSentPage() {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const back = useRingsideTrip(
    atShowScoresNotSentPath(showId ?? ''),
    `/at-show/${encodeURIComponent(showId ?? '')}`
  );
  const { rows, loading, readFailed, retry } = useScoresNotSent(showId);
  const unsent = rows.filter(row => row.state !== 'superseded').length;
  const refused = rows.filter(row => row.state === 'refused').length;

  return (
    <main className="ringside-root mx-auto max-w-2xl px-4 py-4">
      <div className="mb-4 flex items-center gap-2">
        <RingsideUpButton
          label={back.label}
          onClick={() => navigate(back.to, { state: back.state })}
        />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Scores not sent</h1>
      {loading ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Reading the scores saved on this phone...
        </p>
      ) : readFailed ? (
        // Unknown is not "all sent": say so, and offer the read again.
        <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-destructive">
            We could not read the scores on this phone, so we cannot say which are sent.
          </p>
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          {/* MYK9-2013: this list is one show's; the phone may still hold another show's. */}
          Every score for this show is sent.
        </p>
      ) : (
        <p role="status" className="mt-1 text-sm text-muted-foreground">
          {unsent} {unsent === 1 ? 'score is' : 'scores are'} saved on this phone and not in
          myK9Show yet
          {refused > 0 ? `, ${refused} of them refused` : ''}. Each one shows the score, so the
          secretary can enter it at the desk.
        </p>
      )}
      {!loading && rows.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map(row => (
            <ScoresNotSentRowCard key={row.entryId} row={row} />
          ))}
        </ul>
      )}
    </main>
  );
}

export default AtShowScoresNotSentPage;
