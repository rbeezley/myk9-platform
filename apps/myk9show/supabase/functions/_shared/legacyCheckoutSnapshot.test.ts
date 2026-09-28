import { describe, expect, it } from 'vitest';
import { buildLegacyCheckoutSnapshot } from './legacyCheckoutSnapshot';

const cart = {
  id: 'cart_1',
  show_id: 'show_1',
  exhibitor_id: 'exhibitor_1',
  items: [
    {
      id: 'item_1',
      dog_id: 'dog_1',
      class_id: 'class_1',
      entry_id: null,
      handler_id: null,
      jump_height: null,
      special_requests: null,
      entry_fee_cents: 2000,
    },
  ],
};

describe('buildLegacyCheckoutSnapshot', () => {
  it('pins a legacy paid session only when Stripe line amounts match the live cart', () => {
    expect(
      buildLegacyCheckoutSnapshot('cs_old', cart, [2000, 80], 2080)
    ).toMatchObject({
      session_id: 'cs_old',
      subtotal_cents: 2000,
      platform_fee_cents: 80,
      total_cents: 2080,
      items: [{ id: 'item_1', fee_cents: 2000 }],
    });
  });

  it('rejects changed item prices instead of guessing a fee for a paid session', () => {
    expect(buildLegacyCheckoutSnapshot('cs_old', cart, [1500, 80], 1580)).toBeNull();
  });

  it('rejects missing Stripe lines', () => {
    expect(buildLegacyCheckoutSnapshot('cs_old', cart, [], 2080)).toBeNull();
  });
});
