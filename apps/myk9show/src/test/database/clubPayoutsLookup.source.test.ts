import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-2193: both card-taking functions read the club's Stripe account before
 * charging. A failed read must answer "try again", not the payouts-off 403, so
 * each function hands the whole lookup result (data AND error) to the shared
 * gate instead of reading `data` alone.
 */
const functions = ['stripe-checkout', 'stripe-payment-link'] as const;

function functionSource(name: (typeof functions)[number]): string {
  return readFileSync(resolve(__dirname, `../../../supabase/functions/${name}/index.ts`), 'utf8');
}

function lookupSlice(name: (typeof functions)[number]): string {
  const source = functionSource(name);
  const start = source.indexOf(".from('club_stripe_accounts')");
  expect(start).toBeGreaterThanOrEqual(0);
  // Only one lookup of the club's account per function.
  expect(source.indexOf(".from('club_stripe_accounts')", start + 1)).toBe(-1);
  const end = source.indexOf('return corsResponse(', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe.each(functions)('%s club account lookup (MYK9-2193)', name => {
  it('decides through the shared gate, which sees the lookup error', () => {
    const slice = lookupSlice(name);

    expect(slice).toContain('clubPayoutsRefusal(clubAccountLookup)');
    expect(slice).toContain('clubAccountLookup.error');
  });

  it('never reads the lookup data alone', () => {
    const source = functionSource(name);

    expect(source).not.toMatch(/\.then\(\(\{ data \}\) => data\?\.payouts_enabled/);
    expect(source).not.toMatch(/const \{ data: connect \}/);
  });
});
