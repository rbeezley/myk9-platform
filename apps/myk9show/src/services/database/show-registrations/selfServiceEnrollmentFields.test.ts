import { describe, expect, it } from 'vitest';
import { buildSelfServiceEnrollmentPaymentFields } from './selfServiceEnrollmentFields';

describe('buildSelfServiceEnrollmentPaymentFields', () => {
  it('never emits a trigger-guarded column', () => {
    const fields = buildSelfServiceEnrollmentPaymentFields({
      existingPaymentStatus: 'paid',
      existingTotalAmountCents: 9630,
      paymentMethod: 'check',
      totalAmountCents: 2500,
    });

    expect(fields).not.toHaveProperty('payment_status');
    expect(fields).not.toHaveProperty('paid_amount');
    expect(fields).not.toHaveProperty('refund_amount');
    expect(fields).not.toHaveProperty('discount_amount');
  });

  it('records the declared method while the enrollment is still unpaid', () => {
    expect(
      buildSelfServiceEnrollmentPaymentFields({
        existingPaymentStatus: 'pending',
        existingTotalAmountCents: 0,
        paymentMethod: 'cash',
        totalAmountCents: 2500,
      })
    ).toEqual({ payment_method: 'cash', total_amount: 2500 });
  });

  it('treats a missing existing status as a row being inserted', () => {
    expect(buildSelfServiceEnrollmentPaymentFields({ paymentMethod: 'check' })).toEqual({
      payment_method: 'check',
    });
  });

  it('does not relabel how a paid enrollment was paid', () => {
    expect(
      buildSelfServiceEnrollmentPaymentFields({
        existingPaymentStatus: 'paid_online',
        existingTotalAmountCents: 100,
        paymentMethod: 'check',
        totalAmountCents: 50,
      })
    ).toEqual({ total_amount: 150 });
  });

  it('emits nothing when there is no method and no amount', () => {
    expect(buildSelfServiceEnrollmentPaymentFields({ existingPaymentStatus: 'pending' })).toEqual(
      {}
    );
  });

  it('accumulates onto a null existing total', () => {
    expect(
      buildSelfServiceEnrollmentPaymentFields({
        existingPaymentStatus: 'pending',
        existingTotalAmountCents: null,
        totalAmountCents: 2500,
      })
    ).toEqual({ total_amount: 2500 });
  });
});
