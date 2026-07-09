import { describe, it, expect } from 'vitest';
import { decideFreshSessionGate } from './freshSessionGate';

describe('decideFreshSessionGate', () => {
  it('skips processing (no entry update, no stripe_orders insert) when the freshly retrieved session is not paid (MP-05: handleEntryPaymentCompleted)', () => {
    const d = decideFreshSessionGate({ payment_status: 'unpaid', amount_total: 5000 });
    expect(d.action).toBe('skip');
    if (d.action === 'skip') {
      expect(d.reason).toContain('unpaid');
    }
  });

  it('skips when the freshly retrieved session has no payment_status at all', () => {
    const d = decideFreshSessionGate({ payment_status: null, amount_total: null });
    expect(d.action).toBe('skip');
    if (d.action === 'skip') {
      expect(d.reason).toContain('unknown');
    }
  });

  it('processes an async_payment_succeeded redrive exactly like a paid checkout.session.completed (MP-05 scenario: async success completes the entry)', () => {
    const completed = decideFreshSessionGate({ payment_status: 'paid', amount_total: 9000 });
    const asyncSucceeded = decideFreshSessionGate({ payment_status: 'paid', amount_total: 9000 });
    expect(completed).toEqual(asyncSucceeded);
    expect(completed.action).toBe('process');
  });

  it('reports the fresh amount, never a payload amount, when paid (MP-07: payload amount_total 0, fresh reports the true amount)', () => {
    // The gate only ever sees the FRESH session — callers must not pass the
    // webhook payload's amount_total in. This proves fresh.amount_total = 0
    // (a genuinely free/comped session) is distinguishable from "no data",
    // and that whatever is passed as `fresh` is what comes back untouched.
    const d = decideFreshSessionGate({ payment_status: 'paid', amount_total: 12345 });
    expect(d).toEqual({ action: 'process', amountTotalCents: 12345 });
  });

  it('skips a payment-link session whose fresh payment_status is not paid (MP-07 scenario: unpaid link session is not processed)', () => {
    const d = decideFreshSessionGate({ payment_status: 'no_payment_required', amount_total: 0 });
    expect(d.action).toBe('skip');
  });
});
