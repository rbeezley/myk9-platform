import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { EntrySubmissionOutcome } from '@/services/database/entries';

export function JuniorPaymentNotice({
  showId,
  outcomes = [],
  adultAmount,
  juniorFee,
}: {
  showId: string;
  outcomes?: EntrySubmissionOutcome[] | undefined;
  adultAmount?: number | undefined;
  juniorFee?: number | undefined;
}) {
  const feePending = outcomes.some(outcome => outcome.outcome === 'created' && outcome.feePending);
  const deferred = outcomes.some(
    outcome => outcome.outcome === 'created' && (outcome.paymentDeferred || outcome.feePending)
  );
  const entryIds = outcomes
    .filter(
      outcome =>
        outcome.outcome === 'created' &&
        outcome.entryId &&
        (!deferred || outcome.paymentDeferred || outcome.feePending)
    )
    .map(outcome => outcome.entryId!);
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>
        {feePending ? (
          <>
            Fee to confirm after sync. Adult estimate for selected classes:{' '}
            {adultAmount !== undefined ? `$${adultAmount.toFixed(2)}` : 'shown on the payment step'}
            .
            {juniorFee !== undefined && juniorFee > 0
              ? ` If a handler qualifies as a junior, that entry is $${juniorFee.toFixed(2)} per class.`
              : ''}{' '}
          </>
        ) : deferred ? (
          'The junior entry fee is confirmed and remains due. '
        ) : (
          'The entry fee is confirmed. '
        )}
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
