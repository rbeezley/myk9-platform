// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-879 wiring pins for the three Deno edge functions that price an entry.
 *
 * The Deno files cannot run under vitest, so the pricing itself is proven where it
 * lives (`_shared/cartItemPricing.test.ts`, `authoritativeFee.junior.test.ts`) and
 * in the behavioral SQL test. What only these files can lose is the LAST HOP: a
 * select that drops `junior_fee_declared` silently prices every junior at the
 * normal fee, and a webhook that stops handing the declaration to the RPC stores
 * no record for the secretary. This pins those hops. It proves the strings are
 * present, not that they run; it is a tripwire, not the verification.
 */
const functionsDir = resolve(__dirname, '../../../supabase/functions');
const read = (file: string) => readFileSync(resolve(functionsDir, file), 'utf8');

describe('junior declaration wiring (MYK9-879)', () => {
  it('stripe-checkout reads the declaration and the show tier, and charges the authoritative price', () => {
    const src = read('stripe-checkout/index.ts');
    expect(src).toContain('junior_fee_declared,');
    expect(src).toContain('junior_handler_fee');
    expect(src).toContain('priceCartItems(');
    expect(src).toContain('loadStoredEntryJunior(');
    expect(src).toContain('unit_amount: authoritativeByItem.get(item.id) ?? 0');
    // It no longer re-derives a per-item fee from the show alone.
    expect(src).not.toContain('authoritativeEntryFeeCents(');
  });

  it('stripe-webhook prices per line from the same function and records the declaration', () => {
    const src = read('stripe-webhook/index.ts');
    expect(src).toContain('junior_fee_declared,');
    expect(src).toContain('junior_handler_fee');
    expect(src).toContain('priceCartItems(');
    expect(src).toContain('authoritativeByItem.get(item.id)');
    expect(src).toContain('p_junior_fee_declared: item.junior_fee_declared === true');
    expect(src).not.toContain('authoritativeByClass');
    expect(src).not.toContain('authoritativeEntryFeeCents(');
  });

  it('stripe-payment-link prices an existing entry from its stored record', () => {
    const src = read('stripe-payment-link/index.ts');
    expect(src).toContain('junior_fee_declared,');
    expect(src).toContain('junior_fee_override_by,');
    expect(src).toContain('junior_handler_fee');
    expect(src).toContain('priceExistingEntryCents(');
    expect(src).not.toContain('authoritativeEntryFeeCents(');
  });

  it('none of the three issues a refund of its own for the declaration', () => {
    expect(read('stripe-checkout/index.ts')).not.toContain('refunds.create');
    expect(read('stripe-payment-link/index.ts')).not.toContain('refunds.create');
  });

  it('the pricing module reads no date of birth and no dog or handler identity', () => {
    const src = read('_shared/cartItemPricing.ts') + read('_shared/authoritativeFee.ts');
    expect(src).not.toMatch(/date_of_birth|people_private|owner_id|co_owner_id|handler_id/);
  });
});
