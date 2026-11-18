/**
 * MYK9-2149 (Codex P2): only the details the FINAL payment choice uses are saved; details
 * left behind by a switch are not.
 */
import { describe, expect, it } from 'vitest';
import { paymentDetailsForMethod } from './paymentDetailsForMethod';
import type { PaymentDetails } from '@/types/show-registration-types';

const leftovers: PaymentDetails = {
  receivedMethod: 'check',
  checkNumber: '1042',
  paymentReference: '1042',
  paymentDate: '2026-11-01',
  groupReference: 'Club batch 7',
  paymentNotes: 'Mailed with the form',
};

describe('paymentDetailsForMethod (MYK9-2149)', () => {
  it('check received keeps its reference, check number, date and notes', () => {
    expect(paymentDetailsForMethod('secretary_paid', leftovers)).toEqual({
      paymentReference: '1042',
      checkNumber: '1042',
      paymentDate: '2026-11-01',
      paymentNotes: 'Mailed with the form',
    });
  });

  it('switching to pay at the show writes none of the received details left behind', () => {
    expect(paymentDetailsForMethod('cash', leftovers)).toEqual({});
    // A check at the show keeps only its own check number.
    expect(paymentDetailsForMethod('check', leftovers)).toEqual({ checkNumber: '1042' });
  });

  it('switching to a club or group writes only its reference', () => {
    expect(paymentDetailsForMethod('group_payment', leftovers)).toEqual({
      groupReference: 'Club batch 7',
    });
  });

  it('a Free entry keeps its reason (the notes) and nothing else', () => {
    expect(paymentDetailsForMethod('waived', leftovers)).toEqual({
      paymentNotes: 'Mailed with the form',
    });
  });

  it('using the money already on the form writes nothing', () => {
    expect(paymentDetailsForMethod('form_money', leftovers)).toEqual({});
  });
});
