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
 * MYK9-2149 (owner decision: collect after submit): after an entry is added to a form that
 * already held money, say what the form still owes, as the server reads it, and link to that
 * entry form, where the payment is recorded when it is taken (its existing payment actions;
 * no second payment surface here). Nothing owed says the money on the form covered it.
 */
export const DeskFormOutcomeNotice: React.FC<DeskFormOutcomeNoticeProps> = ({
  showId,
  outcome,
}) => {
  const covered = outcome.owedCents !== null && outcome.owedCents <= 0;
  return (
    <Alert role="status" className="mb-6">
      <Wallet className="h-4 w-4" />
      <AlertDescription>
        <p>{deskFormOutcomeLabel(outcome.owedCents)}</p>
        {!covered && (
          <Link
            to={deskOwedHref(showId, outcome.formId)}
            className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-2"
          >
            Open the entry form
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
};
