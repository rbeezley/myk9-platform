// Pins handleEvent's event.type -> handler mapping in index.ts as source
// text, rather than importing index.ts: the file reads Deno.env at module
// scope and throws if the Stripe/Supabase secrets are missing, so it cannot
// be imported under plain vitest (see webhookHandler.ts for the part of the
// entrypoint that WAS extracted and is exercised behaviorally). Grep this
// file before changing the switch in index.ts — see
// docs/reference/source-text-regression-tests convention (#624).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

function handleEventBody(): string {
  const start = source.indexOf('async function handleEvent(event: Stripe.Event) {');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\nasync function handleRefundFailed', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('stripe-webhook event.type dispatch (source-pinned)', () => {
  const body = handleEventBody();

  it.each([
    ['checkout.session.completed', 'handleCheckoutCompleted'],
    ['checkout.session.async_payment_succeeded', 'handleCheckoutCompleted'],
    ['customer.subscription.created', 'handleSubscriptionChange'],
    ['customer.subscription.updated', 'handleSubscriptionChange'],
    ['customer.subscription.deleted', 'handleSubscriptionChange'],
    ['invoice.paid', 'handleInvoicePaid'],
    ['invoice.payment_failed', 'handleInvoicePaymentFailed'],
    ['charge.refunded', 'handleChargeRefunded'],
    ['refund.failed', 'handleRefundFailed'],
    ['refund.updated', 'handleRefundUpdated'],
    ['charge.dispute.created', 'handleDisputeCreated'],
    ['account.updated', 'handleAccountUpdated'],
    ['account.application.deauthorized', 'handleAccountDeauthorized'],
  ])('routes %s to %s', (eventType, handlerName) => {
    const caseIndex = body.indexOf(`case '${eventType}':`);
    expect(caseIndex, `missing case '${eventType}'`).toBeGreaterThan(-1);

    // Fall-through cases (e.g. checkout.session.completed /
    // checkout.session.async_payment_succeeded) share one body ending in
    // `break;`. Take the body through the next `break;` after this case
    // label — the shared body belongs to every case label in the group.
    const breakIndex = body.indexOf('break;', caseIndex);
    expect(breakIndex, `no break; found after case '${eventType}'`).toBeGreaterThan(-1);
    const caseBody = body.slice(caseIndex, breakIndex + 'break;'.length);

    expect(caseBody, `case '${eventType}' does not call ${handlerName}(`).toContain(
      `${handlerName}(`
    );
  });

  it('acks (logs, does not throw) an explicitly no-op event type: checkout.session.async_payment_failed', () => {
    const caseIndex = body.indexOf("case 'checkout.session.async_payment_failed':");
    expect(caseIndex).toBeGreaterThan(-1);
    const nextCaseIndex = body.indexOf('case ', caseIndex + 1);
    const caseBody = body.slice(caseIndex, nextCaseIndex);
    expect(caseBody).toContain('console.log');
    expect(caseBody).not.toMatch(/await handle\w+\(/);
  });

  it('falls through to a default branch that logs and does not throw for unknown event types', () => {
    const defaultIndex = body.indexOf('default:');
    expect(defaultIndex).toBeGreaterThan(-1);
    const defaultBody = body.slice(defaultIndex);
    expect(defaultBody).toContain('Unhandled event type');
  });

  it('dispatches account.application.deauthorized using event.account, not event.data.object', () => {
    const caseIndex = body.indexOf("case 'account.application.deauthorized':");
    const nextIndex = body.indexOf('default:', caseIndex);
    const caseBody = body.slice(caseIndex, nextIndex);
    expect(caseBody).toContain('handleAccountDeauthorized(event.account');
  });
});
