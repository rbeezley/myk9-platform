import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PAYMENT_LINK_SERVER_MESSAGES } from '@/components/entries/management/paymentLinkMessages';

/**
 * MYK9-1824: RequestPaymentDialog shows a specific message only for exact answers
 * from stripe-payment-link (it sends sentences, not codes). If the function's
 * wording changes, the dialog would quietly fall back to the generic sentence, so
 * every key must still appear verbatim in the function's source.
 */
// The function's source plus the shared module it sends the refund-policy refusal from
// (MYK9-1976), which is the only other place its answers are written.
const source = [
  '../../../supabase/functions/stripe-payment-link/index.ts',
  '../../../supabase/functions/_shared/withdrawalPolicyDisclosureText.ts',
]
  .map(path => readFileSync(resolve(__dirname, path), 'utf8'))
  .join('\n');

describe('stripe-payment-link answers the dialog maps', () => {
  it.each(Object.keys(PAYMENT_LINK_SERVER_MESSAGES))('the function still sends %s', key => {
    expect(source).toContain(key);
  });
});
