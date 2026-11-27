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
  // MYK9-2479: Partial Payment now saves the amount she received on this device, so the
  // note names it (Codex round 1 on #4461). Before, every other path was online-only too.
  it('cannot be confirmed, and points at Partial Payment for the amount received', () => {
    renderDialog(true);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByTestId('full-payment-unknown-note')).toHaveTextContent(
      'Paid in Full needs the balance, which has not loaded. Use Partial Payment to record the amount you received.'
    );
    expect(screen.queryByText('$50.00')).not.toBeInTheDocument();
  });

  it('confirms as before when the balance is known', () => {
    renderDialog(false);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    expect(screen.queryByTestId('full-payment-unknown-note')).not.toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });
});
