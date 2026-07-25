import { describe, expect, it } from 'vitest';
import { isPullRefundSchemaUnavailable } from './pullRefundSchemaCompatibility';

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
      isPullRefundSchemaUnavailable({ code: '42501', message: 'permission denied for table entries' })
    ).toBe(false);
  });
});
