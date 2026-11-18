import React from 'react';
import type { LedgerSaveStatus } from './useLedgerDialogSave';

/**
 * MYK9-2156: shown inside a payment or refund dialog whose ledger write did not
 * succeed. The dialog stays open with what was typed. A refused write was not
 * saved, so trying again is safe; an unconfirmed one may have been saved, so the
 * secretary checks the form's payments first instead of recording it twice.
 */
export const LedgerNotSavedNote: React.FC<{ status: LedgerSaveStatus }> = ({ status }) => {
  if (status === 'failed') {
    return (
      <p role="alert" className="text-sm text-destructive" data-testid="ledger-not-saved">
        Not saved. What you typed is still here, so you can try again.
      </p>
    );
  }
  if (status === 'unconfirmed') {
    return (
      <p role="alert" className="text-sm text-destructive" data-testid="ledger-unconfirmed">
        We could not confirm this was saved. Check the payments on this form before you try again.
      </p>
    );
  }
  return null;
};

export default LedgerNotSavedNote;
