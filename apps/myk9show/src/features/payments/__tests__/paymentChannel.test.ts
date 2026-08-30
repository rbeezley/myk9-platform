/**
 * F18 — every paid entry read "Paid online", including cheques and cash.
 *
 * `mapPaymentStatus` folded the generic database status `'paid'` onto
 * `PaymentStatus.PAID_ONLINE`, discarding `payment_method`. A secretary reconciling
 * mail-in cheques against a Stripe payout could not tell the two apart, which is the
 * whole job that screen exists for.
 *
 * The case that matters most is `unknown`: on staging 1,228 entries are `paid` and
 * 1,232 record no method at all, so "Paid online" was an unfounded claim about nearly
 * every row — not just the mail-in ones the audit happened to walk.
 */
import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import {
  entryManagementPaymentLabel,
  financialReportPaymentLabel,
  resolvePaymentChannel,
} from '../paymentChannel';

describe('resolvePaymentChannel — the recorded method wins', () => {
  it.each([
    ['check', 'check'],
    ['cheque', 'check'],
    ['cash', 'cash'],
    ['credit_card', 'online'],
    ['stripe', 'online'],
    ['secretary_paid', 'secretary'],
    ['group_payment', 'group'],
    ['waived', 'waived'],
  ])('reads %s as %s', (method, expected) => {
    expect(resolvePaymentChannel({ paymentMethod: method, paymentStatus: 'paid' })).toBe(expected);
  });

  it('prefers the method over a status that disagrees', () => {
    // The walked entry: payment_method 'secretary_paid', payment_status 'paid'.
    // Status alone said PAID_ONLINE; the method is the only field that knows.
    expect(
      resolvePaymentChannel({
        paymentMethod: 'check',
        paymentStatus: PaymentStatus.PAID_ONLINE,
      })
    ).toBe('check');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(resolvePaymentChannel({ paymentMethod: '  Check ' })).toBe('check');
  });
});

describe('resolvePaymentChannel — no method recorded', () => {
  it('does NOT claim online for a bare paid status', () => {
    // This is the finding, in one assertion.
    expect(resolvePaymentChannel({ paymentStatus: 'paid' })).toBe('unknown');
    expect(resolvePaymentChannel({ paymentStatus: 'paid', paymentMethod: null })).toBe('unknown');
  });

  it('still honours the three statuses that ARE a channel', () => {
    // These enum members carry a channel by construction, so they are not a guess.
    expect(resolvePaymentChannel({ paymentStatus: PaymentStatus.PAID_ONLINE })).toBe('online');
    expect(resolvePaymentChannel({ paymentStatus: PaymentStatus.PAID_BY_CHECK })).toBe('check');
    expect(resolvePaymentChannel({ paymentStatus: PaymentStatus.PAID_BY_CASH })).toBe('cash');
  });

  it('reports waived', () => {
    expect(resolvePaymentChannel({ paymentStatus: PaymentStatus.WAIVED })).toBe('waived');
    expect(resolvePaymentChannel({ paymentStatus: 'waived' })).toBe('waived');
  });

  it('returns unknown for an empty input rather than defaulting to a channel', () => {
    expect(resolvePaymentChannel({})).toBe('unknown');
    expect(resolvePaymentChannel({ paymentMethod: '', paymentStatus: '' })).toBe('unknown');
  });

  it('returns unknown for a method it does not recognise', () => {
    // Inventing a channel from an unmapped value is the same mistake in another form.
    expect(resolvePaymentChannel({ paymentMethod: 'venmo', paymentStatus: 'paid' })).toBe(
      'unknown'
    );
  });
});

describe('labels', () => {
  it('says plain "Paid" when the channel is unknown', () => {
    expect(entryManagementPaymentLabel('unknown')).toBe('Paid');
    expect(financialReportPaymentLabel('unknown')).toBe('Paid');
  });

  it('never labels an unknown channel as online', () => {
    for (const label of [
      entryManagementPaymentLabel('unknown'),
      financialReportPaymentLabel('unknown'),
    ]) {
      expect(label.toLowerCase()).not.toContain('online');
    }
  });

  it('keeps each surface’s own wording', () => {
    // Entry Management writes a status line; the Financial Report writes a column.
    expect(entryManagementPaymentLabel('check')).toBe('Paid by check');
    expect(financialReportPaymentLabel('check')).toBe('Check');
  });

  it('names the secretary and group channels rather than folding them into online', () => {
    expect(entryManagementPaymentLabel('secretary')).toMatch(/secretary/i);
    expect(entryManagementPaymentLabel('group')).toMatch(/group/i);
  });
});
