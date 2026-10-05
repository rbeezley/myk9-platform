// @vitest-environment node
// MYK9-963: index.ts reads Deno.env at module scope and cannot be imported
// under vitest, so its wiring is read from the file text (the convention of
// orderSnapshot.source.test.ts). The behavior of the queue call itself is
// tested in _shared/unfulfilledChargeRefund.test.ts; this pins that every
// paid-got-nothing exit of the cart path QUEUES, and that no alert the
// webhook still raises tells an operator to refund outside the queue.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { instructsManualRefund } from '../_shared/refundAlertCopy';

const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

/** The argument text of every call to `name(`, matched by parenthesis depth. */
function callArgs(name: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(`${name}(`, from);
    if (start < 0) return out;
    let depth = 0;
    let i = start + name.length;
    for (; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')' && --depth === 0) break;
    }
    out.push(source.slice(start + name.length + 1, i));
    from = i;
  }
}

describe('stripe-webhook: a paid checkout that created nothing is queued (MYK9-963)', () => {
  it('queues each reason exactly once, with its own alert copy', () => {
    const calls = callArgs('await queueUnfulfilledCharge');
    const reasons = calls.map(c => /reason: '([a-z_]+)'/.exec(c)?.[1]).sort();
    expect(reasons).toEqual([
      'cart_classes_not_in_show',
      'cart_not_claimable',
      'no_cart',
      'paid_amount_mismatch',
      'stale_checkout',
    ]);
    for (const call of calls) expect(call).toMatch(/copy: [a-zA-Z]+ChargeAlert\(/);
  });

  it('never raises an alert that tells an operator to refund outside the queue', () => {
    const alerts = callArgs('alertAdmin');
    expect(alerts.length).toBeGreaterThan(10);
    const offending = alerts.filter(text => instructsManualRefund(text.replace(/\$\{/g, ' ${')));
    expect(offending).toEqual([]);
  });

  it('a cart READ error is retried (5xx), never queued as a missing cart', () => {
    expect(source).toContain("if (cartError && cartError.code !== 'PGRST116')");
  });
});
