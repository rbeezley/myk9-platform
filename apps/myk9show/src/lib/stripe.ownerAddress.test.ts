/**
 * MYK9-1010 — stripe-checkout refuses an AKC cart line whose owner has no
 * complete address, 422 `owner_address_required`, before any Stripe call. The
 * exhibitor must read the server's sentence (dog and missing parts) with the
 * code intact, not the generic "non-2xx" text, and the client must not retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock('../stripe-config', () => ({ products: {}, annualPriceId: 'price_annual' }));

import { CheckoutSessionError, createEntryCheckoutSession } from './stripe';
import { OWNER_ADDRESS_REQUIRED_CODE } from '@/features/registration/ownerAddress';

const MESSAGE =
  "Add the owner's street address and ZIP or postal code to enter Rex in an AKC trial. AKC prints the owner's address in the marked catalog.";

const realLocation = Object.getOwnPropertyDescriptor(window, 'location');

beforeEach(() => {
  invoke.mockReset();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, origin: 'https://app.test', href: '' },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (realLocation) Object.defineProperty(window, 'location', realLocation);
});

describe('createEntryCheckoutSession — owner address refusal', () => {
  it('surfaces the server sentence with the owner_address_required code, once', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 422,
          json: async () => ({
            error: MESSAGE,
            code: OWNER_ADDRESS_REQUIRED_CODE,
            dogs: [{ dog_id: 'dog-1', dog_name: 'Rex', missing: ['street address'] }],
          }),
        },
      },
    });

    const caught = await createEntryCheckoutSession('cart-1').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(CheckoutSessionError);
    expect(caught).toMatchObject({
      message: MESSAGE,
      status: 422,
      code: OWNER_ADDRESS_REQUIRED_CODE,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
