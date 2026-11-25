// @vitest-environment node
// MYK9-2338: a failed PostgREST read or write answers 5xx so Stripe retries;
// only a CONFIRMED missing payment-link row queues the full-charge refund.
// index.ts reads Deno.env at module scope and cannot be imported under vitest,
// so the handler's branching is composed here from the same helpers and the
// real request handler, and its wiring is pinned from the file text (the
// convention of unfulfilledCharge.source.test.ts).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  NO_ROW_CODE,
  paidAtIsoFromEvent,
  paymentLinkRowOrMissing,
  throwIfDbError,
  throwIfSingleReadFailed,
  type DbError,
} from './transientDbError';
import { createWebhookRequestHandler } from './webhookHandler';

const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

const transient: DbError = {
  message: 'canceling statement due to statement timeout',
  code: '57014',
};

interface LinkRow {
  id: string;
}

/**
 * The payment-link branch of handleEntryPaymentRequestCompleted: a confirmed
 * missing row alerts and queues the full charge; a found row is fulfilled.
 */
function paymentLinkDispatch(lookup: { data: LinkRow | null; error: DbError | null }) {
  const queueRefundRequest = vi.fn(async () => {});
  const alert = vi.fn(async () => {});
  const fulfill = vi.fn<(link: LinkRow) => Promise<void>>(async () => {});
  const dispatch = async () => {
    const link = paymentLinkRowOrMissing(lookup, 'cs_1');
    if (!link) {
      await alert();
      await queueRefundRequest();
      return;
    }
    await fulfill(link);
  };
  const outerAlert = vi.fn(async () => {});
  const handler = createWebhookRequestHandler({
    verifyEvent: async () => ({ id: 'evt_1' }),
    platformSecret: 'whsec',
    dispatch,
    alertAdmin: outerAlert,
  });
  const request = new Request('https://example.test/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig' },
    body: '{}',
  });
  return { handler, request, queueRefundRequest, alert, fulfill, outerAlert };
}

describe('payment-link lookup (MYK9-2338)', () => {
  it('answers 500 on a transient read error and queues no refund request', async () => {
    const t = paymentLinkDispatch({ data: null, error: transient });
    const response = await t.handler(t.request);
    expect(response.status).toBe(500);
    expect(t.queueRefundRequest).not.toHaveBeenCalled();
    expect(t.alert).not.toHaveBeenCalled();
    expect(t.fulfill).not.toHaveBeenCalled();
    expect(t.outerAlert).toHaveBeenCalledWith(
      'Webhook handler failed before acknowledgment',
      expect.stringContaining('Could not read the payment link for cs_1'),
      expect.objectContaining({ dedupeKey: 'handler-failed-evt_1' })
    );
  });

  it('treats PGRST116 from maybeSingle (more than one row) as a failure, not a missing row', async () => {
    const t = paymentLinkDispatch({
      data: null,
      error: { message: 'multiple', code: NO_ROW_CODE },
    });
    expect((await t.handler(t.request)).status).toBe(500);
    expect(t.queueRefundRequest).not.toHaveBeenCalled();
  });

  it('answers 200 and queues the refund request only for a confirmed missing row', async () => {
    const t = paymentLinkDispatch({ data: null, error: null });
    const response = await t.handler(t.request);
    expect(response.status).toBe(200);
    expect(t.queueRefundRequest).toHaveBeenCalledTimes(1);
    expect(t.alert).toHaveBeenCalledTimes(1);
    expect(t.outerAlert).not.toHaveBeenCalled();
  });

  it('fulfills a found row', async () => {
    const t = paymentLinkDispatch({ data: { id: 'link-1' }, error: null });
    expect((await t.handler(t.request)).status).toBe(200);
    expect(t.fulfill).toHaveBeenCalledWith({ id: 'link-1' });
    expect(t.queueRefundRequest).not.toHaveBeenCalled();
  });
});

describe('throwIfDbError / throwIfSingleReadFailed', () => {
  it('throwIfDbError throws on any error and passes on none', () => {
    expect(() => throwIfDbError(transient, 'Could not read classes')).toThrow(
      'Could not read classes: canceling statement due to statement timeout'
    );
    expect(() => throwIfDbError({ message: 'x', code: NO_ROW_CODE }, 'w')).toThrow('w: x');
    expect(() => throwIfDbError(null, 'w')).not.toThrow();
    expect(() => throwIfDbError(undefined, 'w')).not.toThrow();
  });

  it('throwIfSingleReadFailed lets .single() no-row through and throws on everything else', () => {
    expect(() =>
      throwIfSingleReadFailed({ message: 'no rows', code: NO_ROW_CODE }, 'w')
    ).not.toThrow();
    expect(() => throwIfSingleReadFailed(null, 'w')).not.toThrow();
    expect(() => throwIfSingleReadFailed(transient, 'Could not read show fees')).toThrow(
      'Could not read show fees: canceling statement due to statement timeout'
    );
  });
});

/** The body of `async function <name>(` up to the next top-level function. */
function functionBody(name: string): string {
  const start = source.indexOf(`async function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nasync function ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

describe('stripe-webhook wiring (MYK9-2338)', () => {
  it('the payment-link lookup goes through paymentLinkRowOrMissing before any refund request', () => {
    const body = functionBody('handleEntryPaymentRequestCompleted');
    const lookup = body.indexOf('paymentLinkRowOrMissing(');
    expect(lookup).toBeGreaterThan(0);
    expect(lookup).toBeLessThan(body.indexOf('noLinkRecordObligation('));
    expect(body).not.toContain('linkError');
    expect(body).toMatch(/throwIfDbError\(\s*loadedEntries\.error,/);
  });

  it('cart verification reads throw before the verify-failed alert', () => {
    const body = functionBody('handleEntryPaymentCompleted');
    const alertAt = body.indexOf("'Paid checkout could not be verified");
    for (const call of [
      'throwIfSingleReadFailed(showFeesError,',
      'throwIfDbError(classesError,',
      'throwIfDbError(storedJuniorError,',
    ]) {
      expect(body).toContain(call);
    }
    expect(body.indexOf('throwIfDbError(classesError,')).toBeLessThan(alertAt);
    // The stored-junior read no longer raises its own "Stripe will not retry" alert.
    expect(body.split("'Paid checkout could not be verified").length - 1).toBe(1);
  });

  it('Connect and subscription writes throw instead of logging and returning', () => {
    expect(functionBody('handleAccountUpdated')).toMatch(/throwIfDbError\(error,/);
    expect(functionBody('handleAccountDeauthorized')).toMatch(/throwIfDbError\(error,/);
    const sync = functionBody('syncSubscriptionFromStripe');
    expect(sync).toMatch(/throwIfDbError\(subError,/);
    expect(sync).toMatch(/throwIfDbError\(profileError,/);
  });

  it('a retried cart is judged at the event time, not the retry clock', () => {
    const body = functionBody('handleEntryPaymentCompleted');
    expect(body).toContain('nowIso: paidAtIso,');
    expect(body).toContain('const nowIso = paidAtIso;');
    expect(body).not.toContain('new Date().toISOString()');
    expect(source).toMatch(
      /handleCheckoutCompleted\(\s*event\.data\.object as Stripe\.Checkout\.Session,\s*paidAtIsoFromEvent\(event\.created\)/
    );
  });

  it('account.updated patches from the account as it stands now', () => {
    const body = functionBody('handleAccountUpdated');
    expect(body).toContain('stripe.accounts.retrieve(account.id)');
    expect(body).toContain('accountToRowPatch(current, livemode)');
  });

  it('the profile tier comes from all of the customer subscriptions', () => {
    const sync = functionBody('syncSubscriptionFromStripe');
    expect(sync).toContain('currentEntitlement(');
    expect(sync).toContain('subscription_tier: entitlement.tier,');
  });
});

describe('paidAtIsoFromEvent', () => {
  it('is the signed event time, the same on every redelivery', () => {
    expect(paidAtIsoFromEvent(1_764_000_000)).toBe('2025-11-24T16:00:00.000Z');
  });
});
