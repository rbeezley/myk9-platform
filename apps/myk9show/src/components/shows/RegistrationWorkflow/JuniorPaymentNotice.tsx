import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { EntrySubmissionOutcome } from '@/services/database/entries';

export function JuniorPaymentNotice({
  showId,
  outcomes = [],
}: {
  showId: string;
  outcomes?: EntrySubmissionOutcome[] | undefined;
}) {
  const feePending = outcomes.some(outcome => outcome.outcome === 'created' && outcome.feePending);
  const entryIds = outcomes
    .filter(outcome => outcome.outcome === 'created' && outcome.entryId)
    .map(outcome => outcome.entryId!);
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>
        {feePending ? 'Sync this entry to confirm its fee. ' : 'The entry fee is confirmed. '}
        Collect payment after confirmation, then{' '}
        {entryIds.length === 0 ? (
          <Link to={`/shows/${showId}/entries?queue=payment-due`} className="underline font-medium">
            record it in Entries Management
          </Link>
        ) : (
          entryIds.map((entryId, index) => (
            <span key={entryId}>
              {index > 0 ? ', ' : ''}
              <Link
                to={`/shows/${showId}/entries?queue=payment-due&entry=${encodeURIComponent(entryId)}`}
                className="underline font-medium"
              >
                {entryIds.length === 1 ? 'record it in Entries Management' : `entry ${index + 1}`}
              </Link>
            </span>
          ))
        )}
        .
      </AlertDescription>
    </Alert>
  );
}
