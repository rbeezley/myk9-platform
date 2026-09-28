import { describe, expect, it } from 'vitest';
import { validateCheckoutFeeSnapshot } from './checkoutFeeSnapshot';

const snapshot = {
  session_id: 'cs_1',
  cart_id: 'cart_1',
  show_id: 'show_1',
  exhibitor_id: 'exhibitor_1',
  subtotal_cents: 1500,
  platform_fee_cents: 100,
  total_cents: 1600,
  items: [
    {
      id: 'item_1',
      dog_id: 'dog_1',
      class_id: 'class_1',
      entry_id: null,
      handler_id: 'handler_1',
      jump_height: null,
      special_requests: null,
      fee_cents: 1500,
    },
  ],
};
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
      handler_id: 'handler_1',
      jump_height: null,
      special_requests: null,
      entry_fee_cents: 3000,
    },
  ],
};

describe('validateCheckoutFeeSnapshot', () => {
  it('uses the frozen fee even after the writable cart price changes', () => {
    expect(validateCheckoutFeeSnapshot(snapshot, cart, 1600)).toEqual({
      ok: true,
      feeByItem: new Map([['item_1', 1500]]),
    });
  });
  it('refuses a changed handler even if the total still matches', () => {
    expect(
      validateCheckoutFeeSnapshot(
        snapshot,
        {
          ...cart,
          items: [{ ...cart.items[0], handler_id: 'handler_2' }],
        },
        1600
      )
    ).toMatchObject({ ok: false });
  });
  it('refuses a changed Stripe total', () => {
    expect(validateCheckoutFeeSnapshot(snapshot, cart, 3000)).toMatchObject({ ok: false });
  });
});
