/**
 * MYK9-1012 — stripe-checkout runs one checkout per cart at a time. A Pay that
 * arrives while another is still starting (a second tab, a double submit) is
 * answered 409 `checkout_in_progress`. The client waits once and asks again,
 * which then picks up the page the first request opened; a second refusal is
 * surfaced with its code instead of looping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock('../stripe-config', () => ({ products: {}, annualPriceId: 'price_annual' }));

import {
  CHECKOUT_IN_PROGRESS_CODE,
  CHECKOUT_IN_PROGRESS_RETRY_MS,
  CheckoutSessionError,
  createEntryCheckoutSession,
} from './stripe';

const IN_PROGRESS = 'Checkout is already starting for this cart. One moment, then try again.';

function inProgress() {
  return {
    data: null,
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        status: 409,
        json: async () => ({ error: IN_PROGRESS, code: CHECKOUT_IN_PROGRESS_CODE }),
      },
    },
  };
}

const realLocation = Object.getOwnPropertyDescriptor(window, 'location');

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, origin: 'https://app.test', href: '' },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  if (realLocation) Object.defineProperty(window, 'location', realLocation);
});

describe('createEntryCheckoutSession — checkout already in progress', () => {
  it('waits once and goes to the page the first request opened', async () => {
    invoke.mockResolvedValueOnce(inProgress()).mockResolvedValueOnce({
      data: { url: 'https://checkout.stripe.com/c/pay/cs_first', sessionId: 'cs_first' },
      error: null,
    });

    const pending = createEntryCheckoutSession('cart-1');
    await vi.advanceTimersByTimeAsync(CHECKOUT_IN_PROGRESS_RETRY_MS - 1);
    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_first');
  });

  it('says so, with the code, when the checkout is still in progress after the wait', async () => {
    invoke.mockResolvedValue(inProgress());

    const pending = createEntryCheckoutSession('cart-1');
    const outcome = expect(pending).rejects.toMatchObject({
      message: IN_PROGRESS,
      status: 409,
      code: CHECKOUT_IN_PROGRESS_CODE,
    });
    await vi.advanceTimersByTimeAsync(CHECKOUT_IN_PROGRESS_RETRY_MS);
    await outcome;
    await expect(pending).rejects.toBeInstanceOf(CheckoutSessionError);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('does not wait or retry for any other refusal', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 409, json: async () => ({ error: 'Your cart changed.' }) },
      },
    });

    await expect(createEntryCheckoutSession('cart-1')).rejects.toMatchObject({
      status: 409,
      code: null,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
