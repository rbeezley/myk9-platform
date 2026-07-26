import { describe, expect, it, vi } from 'vitest';
import { resolveCheckoutSession, type CheckoutSessionLike } from './priorCheckoutSession';

function session(overrides: Partial<CheckoutSessionLike> = {}): CheckoutSessionLike {
  return {
    id: 'cs_prior',
    status: 'open',
    amount_total: 5000,
    url: 'https://checkout.stripe.test/cs_prior',
    ...overrides,
  };
}

function setup(existing: CheckoutSessionLike | Error) {
  const retrieve =
    existing instanceof Error
      ? vi.fn().mockRejectedValue(existing)
      : vi.fn().mockResolvedValue(existing);
  const expire = vi.fn().mockResolvedValue(undefined);
  const createReplacement = vi.fn().mockResolvedValue(
    session({
      id: 'cs_new',
      status: 'open',
      url: 'https://checkout.stripe.test/cs_new',
    })
  );

  return { retrieve, expire, createReplacement };
}

describe('resolveCheckoutSession', () => {
  it('fails closed without creating when the prior session cannot be retrieved', async () => {
    const mocks = setup(new Error('Stripe unavailable'));

    const result = await resolveCheckoutSession({
      priorSessionId: 'cs_prior',
      expectedAmountCents: 5000,
      sessions: mocks,
      createReplacement: mocks.createReplacement,
    });

    expect(result).toEqual({
      kind: 'blocked',
      status: 503,
      error: 'We could not safely resume checkout. Please try again in a moment.',
    });
    expect(mocks.createReplacement).not.toHaveBeenCalled();
  });

  it('fails closed without creating when a stale open session cannot be expired', async () => {
    const mocks = setup(session({ amount_total: 4000 }));
    mocks.expire.mockRejectedValue(new Error('expiration failed'));

    const result = await resolveCheckoutSession({
      priorSessionId: 'cs_prior',
      expectedAmountCents: 5000,
      sessions: mocks,
      createReplacement: mocks.createReplacement,
    });

    expect(result.kind).toBe('blocked');
    expect(result).toMatchObject({ status: 503 });
    expect(mocks.createReplacement).not.toHaveBeenCalled();
  });

  it('reuses an unchanged open session without creating', async () => {
    const mocks = setup(session());

    const result = await resolveCheckoutSession({
      priorSessionId: 'cs_prior',
      expectedAmountCents: 5000,
      sessions: mocks,
      createReplacement: mocks.createReplacement,
    });

    expect(result).toMatchObject({ kind: 'ready', reused: true });
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(mocks.createReplacement).not.toHaveBeenCalled();
  });

  it('blocks a complete prior session without creating', async () => {
    const mocks = setup(session({ status: 'complete' }));

    const result = await resolveCheckoutSession({
      priorSessionId: 'cs_prior',
      expectedAmountCents: 5000,
      sessions: mocks,
      createReplacement: mocks.createReplacement,
    });

    expect(result).toMatchObject({ kind: 'blocked', status: 409 });
    expect(mocks.createReplacement).not.toHaveBeenCalled();
  });
});
