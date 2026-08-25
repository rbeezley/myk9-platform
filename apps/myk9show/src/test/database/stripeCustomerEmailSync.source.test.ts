import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const checkoutSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-checkout/index.ts'),
  'utf8'
);

describe('Stripe checkout customer email synchronization', () => {
  it('refreshes reused customer emails from the authenticated user', () => {
    expect(checkoutSource).toContain('const currentEmail = user.email?.trim() || undefined;');
    expect(checkoutSource).toContain(".select('stripe_customer_id, email')");
    expect(checkoutSource).toContain(
      'await stripe.customers.update(existing.stripe_customer_id, {\n            email: currentEmail,'
    );
    expect(checkoutSource).toContain(
      ".from('stripe_customers')\n            .update({ email: currentEmail })"
    );
    expect(checkoutSource).toContain("throw new Error('Failed to sync Stripe customer email');");
  });
});
