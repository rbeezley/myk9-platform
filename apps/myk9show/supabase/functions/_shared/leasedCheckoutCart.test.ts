// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { checkoutLeasedCart } from './leasedCheckoutCart';
import { OWNER_ADDRESS_REQUIRED_CODE, type OwnerAddressGateLine } from './cartOwnerAddressGate';

/**
 * MYK9-1010, Codex round 2: the owner-address gate must judge the cart
 * snapshot read UNDER the checkout lease, the one that is priced and that
 * creates or reuses the Checkout Session, not only the first read. An
 * addressless AKC line added between the two reads would otherwise reach
 * Stripe (the later version checks accept the newer snapshot).
 */

type Cart = { id: string; items: OwnerAddressGateLine[] };

const cleanLine: OwnerAddressGateLine = {
  dog_id: 'dog-ukc',
  entry_id: null,
  dog: { call_name: 'Uki', owner: null },
  class: { trial: { registry_id: 'UKC' } },
};
const addresslessAkcLine: OwnerAddressGateLine = {
  dog_id: 'dog-rex',
  entry_id: null,
  dog: {
    call_name: 'Rex',
    owner: { street_address: '', city: 'Springfield', state: 'IL', zip_code: null },
  },
  class: { trial: { registry_id: 'AKC' } },
};

const respond = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status });

describe('checkoutLeasedCart', () => {
  it('refuses when the LEASED snapshot gained an addressless AKC line, before proceeding', async () => {
    // The first read (before the lease) held only the clean line.
    const proceed = vi.fn(async () => respond({ url: 'https://checkout.stripe.com/x' }, 200));
    const response = await checkoutLeasedCart<Cart>({
      reload: async () => ({ data: { id: 'cart-1', items: [cleanLine, addresslessAkcLine] }, error: null }),
      proceed,
      respond,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: OWNER_ADDRESS_REQUIRED_CODE,
      dogs: [{ dog_id: 'dog-rex', dog_name: 'Rex' }],
    });
    expect(proceed).not.toHaveBeenCalled();
  });

  it('proceeds with the leased snapshot itself when it passes', async () => {
    const leased: Cart = { id: 'cart-1', items: [cleanLine] };
    const proceed = vi.fn(async () => respond({ url: 'https://checkout.stripe.com/x' }, 200));
    const response = await checkoutLeasedCart<Cart>({
      reload: async () => ({ data: leased, error: null }),
      proceed,
      respond,
    });

    expect(response.status).toBe(200);
    expect(proceed).toHaveBeenCalledWith(leased);
  });

  it('answers 404 when the cart is gone under the lease', async () => {
    const proceed = vi.fn();
    const response = await checkoutLeasedCart<Cart>({
      reload: async () => ({ data: null, error: { message: 'no rows' } }),
      proceed,
      respond,
    });

    expect(response.status).toBe(404);
    expect(proceed).not.toHaveBeenCalled();
  });
});
