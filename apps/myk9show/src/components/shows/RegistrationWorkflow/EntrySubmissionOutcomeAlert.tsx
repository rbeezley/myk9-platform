import { AlertCircle, Clock, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { EntrySubmissionOutcome } from '@/services/database/entries';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { summarizeEntrySubmissionOutcomes } from './entrySubmissionOutcomes';

interface EntrySubmissionOutcomeAlertProps {
  outcomes?: EntrySubmissionOutcome[] | undefined;
}

const CROSS_EXHIBITOR_WAITLIST_REASON =
  'dog already on this class wait list for a different exhibitor';

function getEntrySubmissionDenialMessage(outcome: EntrySubmissionOutcome): string {
  if (outcome.denialReason === CROSS_EXHIBITOR_WAITLIST_REASON) {
    return 'already has an active wait-list spot for another exhibitor.';
  }

  return 'could not be entered because the class is full.';
}

export function EntrySubmissionOutcomeAlert({ outcomes }: EntrySubmissionOutcomeAlertProps) {
  const { dogs } = useDogStoreCompat();
  const { classes } = useClassStoreCompat();
  if (!outcomes || outcomes.length === 0) return null;

  const waitlisted = outcomes.filter(outcome => outcome.outcome === 'waitlisted');
  const denied = outcomes.filter(outcome => outcome.outcome === 'denied');
  const { createdCount, deniedCount, overrideCount } = summarizeEntrySubmissionOutcomes(outcomes);
  const selectionLabel = (outcome: EntrySubmissionOutcome) => {
    const dog = dogs.find(candidate => candidate.id === outcome.dogId);
    const entryClass = classes.find(candidate => candidate.id === outcome.classId);
    return `${dog?.callName || dog?.name || outcome.dogId} — ${entryClass?.className || outcome.classId}`;
  };

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
          <p>{`${deniedCount} ${deniedCount === 1 ? 'selection could' : 'selections could'} not be entered.`}</p>
        )}
        {waitlisted.map(outcome => (
          <p key={`${outcome.dogId}:${outcome.classId}:waitlisted`}>
            {`${selectionLabel(outcome)}: joined the wait list; no payment is due unless a spot is offered.`}
          </p>
        ))}
        {denied.map(outcome => (
          <p key={`${outcome.dogId}:${outcome.classId}:denied`}>
            {`${selectionLabel(outcome)}: ${getEntrySubmissionDenialMessage(outcome)}`}
          </p>
        ))}
        {overrideCount > 0 && (
          <p>{`${overrideCount} show-desk ${overrideCount === 1 ? 'entry was' : 'entries were'} recorded with a capacity override.`}</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
