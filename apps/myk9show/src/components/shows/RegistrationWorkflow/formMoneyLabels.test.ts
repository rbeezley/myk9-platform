/**
 * MYK9-2149 (Codex P2): "Use the money already on this form" is never shown as money received
 * or paid. The method reads "Money on this form"; the total reads "(before money on this form)".
 */
import { describe, expect, it } from 'vitest';
import { getPaymentMethodLabel } from './PaymentStep/utils';
import { getPaymentMethodDisplay } from './ConfirmationStep.helpers';
import { computePaymentTotals, formatAmountDue } from './EntriesPanel/EntriesPanel.helpers';
import { getPaymentSubmitLabel } from '@/pages/RegistrationWizardPage/commitLabels';

const feeCalculation = { subtotal: 30, discounts: [], taxes: 0, total: 30, breakdown: [] };
const rates = { percent: 7, flatCents: 0, minCents: 0 };

describe('the form-money choice is never "received" or "paid" (MYK9-2149)', () => {
  it('names the method "Money on this form" on the badge and the receipt', () => {
    expect(getPaymentMethodLabel('form_money')).toBe('Money on this form');
    expect(getPaymentMethodDisplay('form_money')).toBe('Money on this form');
  });

  it('labels the total as entry fees "(before money on this form)", never "(Received)"', () => {
    const totals = computePaymentTotals({
      paymentMethod: 'form_money',
      feeCalculation,
      capacityReady: true,
      rates,
    });

    expect(totals.isSecretaryReceived).toBe(false);
    expect(
      formatAmountDue({ capacityReady: true, totals, entryFeeCents: 3000, classCount: 1 })
    ).toBe('$30.00 (before money on this form)');
  });

  it('submits with a plain "Submit entry"', () => {
    expect(getPaymentSubmitLabel('form_money')).toBe('Submit entry');
  });
});
