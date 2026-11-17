import React from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { deskOwedHref } from '@/components/entries/management/checkInDesk/deskAmountOwed';
import { deskFormOutcomeLabel, type DeskFormOutcome } from '@/features/registration/deskFormDue';

interface DeskFormOutcomeNoticeProps {
  showId: string;
  outcome: DeskFormOutcome;
}

/**
 * MYK9-2149 (inform only): after an entry is added to a form that already held money, say the
 * form's balance in neutral words, as the server reads it ("Still owed on this form: $Y" or
 * "Nothing is owed on this form now."), and always link to that entry form, where anything owed
 * is recorded when it is taken (its existing payment actions; no second payment surface here).
 * In a new tab, like every link out of the wizard.
 */
export const DeskFormOutcomeNotice: React.FC<DeskFormOutcomeNoticeProps> = ({
  showId,
  outcome,
}) => {
  return (
    <Alert role="status" className="mb-6">
      <Wallet className="h-4 w-4" />
      <AlertDescription>
        <p>{deskFormOutcomeLabel(outcome.owedCents)}</p>
        <Link
          to={deskOwedHref(showId, outcome.formId)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-2"
        >
          Open the entry form
        </Link>
      </AlertDescription>
    </Alert>
  );
};
