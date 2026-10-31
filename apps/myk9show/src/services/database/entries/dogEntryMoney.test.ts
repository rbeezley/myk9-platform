import { describe, expect, it } from 'vitest';
import { withServerPaymentFields, withoutUnverifiedPayment } from './dogEntryMoney';

describe('withServerPaymentFields', () => {
  it('keeps the server payment fields and move-up link over a stale local overlay', () => {
    const server = { payment_status: 'paid_online', entry_fee: 30, moved_from_entry_id: 'src-1' };
    const merged = { ...server, payment_status: 'pending', moved_from_entry_id: null, armband: 7 };
    expect(withServerPaymentFields(merged, server)).toEqual({
      payment_status: 'paid_online',
      entry_fee: 30,
      moved_from_entry_id: 'src-1',
      armband: 7,
    });
  });

  it('drops a local move-up link the server row does not carry', () => {
    const merged = { moved_from_entry_id: 'local-only', armband: 7 };
    expect(withServerPaymentFields(merged, {})).toEqual({ armband: 7 });
  });
});

describe('withoutUnverifiedPayment', () => {
  it('nulls payment and lineage on a row the server has never seen', () => {
    expect(
      withoutUnverifiedPayment({ payment_status: 'pending', moved_from_entry_id: 'x', armband: 1 })
    ).toEqual({ payment_status: null, moved_from_entry_id: null, armband: 1 });
  });
});
