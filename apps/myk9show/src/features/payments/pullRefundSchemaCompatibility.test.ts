import { describe, expect, it } from 'vitest';
import {
  isPullRefundSchemaUnavailable,
  isWithdrawalReasonCodeSchemaUnavailable,
} from './pullRefundSchemaCompatibility';

describe('isPullRefundSchemaUnavailable', () => {
  it('recognizes a missing refund decision column', () => {
    expect(
      isPullRefundSchemaUnavailable({
        code: '42703',
        message: 'column entries.refund_decision does not exist',
      })
    ).toBe(true);
  });

  it('recognizes a missing refund decision RPC in the PostgREST schema cache', () => {
    expect(
      isPullRefundSchemaUnavailable({
        code: 'PGRST202',
        message: 'Could not find the function public.set_entry_refund_decision in the schema cache',
      })
    ).toBe(true);
  });

  it('does not hide unrelated database failures', () => {
    expect(
      isPullRefundSchemaUnavailable({
        code: '42501',
        message: 'permission denied for table entries',
      })
    ).toBe(false);
  });
});

describe('isWithdrawalReasonCodeSchemaUnavailable (MYK9-632)', () => {
  it('matches only the reason-code column, so the refund-decision rung is not dropped with it', () => {
    expect(
      isWithdrawalReasonCodeSchemaUnavailable({
        code: '42703',
        message: 'column entries.withdrawal_reason_code does not exist',
      })
    ).toBe(true);
    // The two column groups are independent rungs of the same ladder; folding
    // them together would lose the refund decision on a database that only
    // lacks the reason code, and re-invite a second refund.
    expect(
      isWithdrawalReasonCodeSchemaUnavailable({
        code: '42703',
        message: 'column entries.refund_decision does not exist',
      })
    ).toBe(false);
    expect(isWithdrawalReasonCodeSchemaUnavailable(null)).toBe(false);
    expect(
      isWithdrawalReasonCodeSchemaUnavailable({
        code: '42501',
        message: 'permission denied for column withdrawal_reason_code',
      })
    ).toBe(false);
  });
});
