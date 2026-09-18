import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';

/**
 * MYK9-600 round-2 review. The dialog's primary sentence is an assertion about
 * what is ABOUT TO HAPPEN. Some callers reach this component to REPORT that a
 * delete did not happen — `BlockedDogDeleteDialog` shows a list of dogs the
 * server refused, under a title saying so, with Close as the only action. In
 * that state "You are about to delete 2 dogs." beside a destructive triangle is
 * simply false, and it is the largest sentence on the dialog.
 */
describe('DeleteConfirmationDialog report-only mode', () => {
  const base = {
    open: true as const,
    onOpenChange: () => {},
    onConfirm: () => {},
    entityName: '2 dogs',
    entityType: 'Dog',
    warningText: 'Pull or refund their entries.',
  };

  it('makes the "about to delete" claim in the normal confirming mode', () => {
    render(<DeleteConfirmationDialog {...base} />);

    expect(screen.getByText(/you are about to delete/i)).toBeInTheDocument();
  });

  it('drops the claim, and the destructive icon, in report-only mode', () => {
    render(<DeleteConfirmationDialog {...base} reportOnly />);

    expect(screen.queryByText(/you are about to delete/i)).not.toBeInTheDocument();
    // The warning and any extra content are the whole point of the dialog and
    // must survive: hiding the false sentence must not hide the explanation.
    expect(screen.getByText('Pull or refund their entries.')).toBeInTheDocument();
    expect(document.querySelector('.text-destructive')).toBeNull();
  });
});
