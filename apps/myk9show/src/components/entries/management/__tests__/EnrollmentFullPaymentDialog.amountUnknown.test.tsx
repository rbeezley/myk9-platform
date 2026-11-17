/**
 * MYK9-1968, Codex review of #4104: "Paid in Full" sends no amount, so the server
 * records the whole remaining balance. When the payment record has not loaded,
 * that balance is unknown, so the dialog must not let the secretary confirm it.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { EnrollmentFullPaymentDialog } from '../EnrollmentFullPaymentDialog';

const state = {
  open: true,
  method: 'cash' as const,
  checkNumber: '',
  receivedOn: '2026-11-17',
};

function renderDialog(amountUnknown: boolean) {
  const onConfirm = vi.fn();
  render(
    <EnrollmentFullPaymentDialog
      state={state}
      onChange={vi.fn()}
      balanceDollars={50}
      amountUnknown={amountUnknown}
      todayInShowZone="2026-11-17"
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />
  );
  return onConfirm;
}

describe('EnrollmentFullPaymentDialog when the balance is not known', () => {
  it('cannot be confirmed, and says the payment waits for the record', () => {
    renderDialog(true);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    const note = screen.getByTestId('full-payment-unknown-note');
    expect(note).toHaveTextContent('Record this payment once the form’s payment record loads.');
    // Every other recording path is online-only too, so none is offered (round 2).
    expect(note).not.toHaveTextContent(/Partial Payment/i);
    expect(screen.queryByText('$50.00')).not.toBeInTheDocument();
  });

  it('confirms as before when the balance is known', () => {
    renderDialog(false);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    expect(screen.queryByTestId('full-payment-unknown-note')).not.toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });
});
