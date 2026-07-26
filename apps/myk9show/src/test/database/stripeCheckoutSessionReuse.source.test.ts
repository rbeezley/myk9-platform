import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-checkout/index.ts'),
  'utf8'
);

describe('stripe-checkout prior-session safety gate', () => {
  it('fails closed when Stripe cannot inspect or expire the prior session', () => {
    expect(source).toContain('Could not safely inspect or expire prior session');
    expect(source).toContain('We could not safely resume checkout');
    expect(source).not.toContain('fall through and create a fresh one');
  });
});
