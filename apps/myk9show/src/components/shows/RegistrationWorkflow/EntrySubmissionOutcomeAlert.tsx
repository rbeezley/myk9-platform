import { AlertCircle, Clock, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { EntrySubmissionOutcome } from '@/services/database/entries';

interface EntrySubmissionOutcomeAlertProps {
  outcomes?: EntrySubmissionOutcome[] | undefined;
}

export function EntrySubmissionOutcomeAlert({ outcomes }: EntrySubmissionOutcomeAlertProps) {
  if (!outcomes || outcomes.length === 0) return null;

  const createdCount = outcomes.filter(outcome => outcome.outcome === 'created').length;
  const waitlisted = outcomes.filter(outcome => outcome.outcome === 'waitlisted');
  const deniedCount = outcomes.filter(outcome => outcome.outcome === 'denied').length;
  const overrideCount = outcomes.filter(outcome => outcome.capacityOverride).length;

  return (
    <Alert>
      {deniedCount > 0 ? (
        <AlertCircle className="h-4 w-4" />
      ) : waitlisted.length > 0 ? (
        <Clock className="h-4 w-4" />
      ) : (
        <Info className="h-4 w-4" />
      )}
      <AlertTitle>Entry summary</AlertTitle>
      <AlertDescription className="space-y-1">
        {createdCount > 0 && (
          <p>{`${createdCount} ${createdCount === 1 ? 'entry' : 'entries'} submitted.`}</p>
        )}
        {waitlisted.length > 0 && (
          <p>
            {`${waitlisted.length} ${waitlisted.length === 1 ? 'selection joined' : 'selections joined'} the wait list. Payment is not due unless a spot is offered.`}
          </p>
        )}
        {deniedCount > 0 && (
          <p>{`${deniedCount} ${deniedCount === 1 ? 'selection could' : 'selections could'} not be entered because it is full.`}</p>
        )}
        {overrideCount > 0 && (
          <p>{`${overrideCount} show-desk ${overrideCount === 1 ? 'entry was' : 'entries were'} recorded with a capacity override.`}</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
