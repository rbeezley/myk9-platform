import { describe, expect, it, vi } from 'vitest';
import {
  openSubscriptionCheckout,
  SUBSCRIPTION_CHECKOUT_RETRY_MESSAGE,
  SUBSCRIPTION_EXISTS_MESSAGE,
  type SubscriptionCheckoutStripe,
} from './subscriptionSessionExpiry';

type Sessions = SubscriptionCheckoutStripe['checkout']['sessions'];
type SessionPage = Awaited<ReturnType<Sessions['list']>>;
type SubscriptionPage = Awaited<ReturnType<SubscriptionCheckoutStripe['subscriptions']['list']>>;

const session = (id: string, mode: string, status = 'open') => ({ id, mode, status });
const noSubscriptions: SubscriptionPage = { data: [], has_more: false };

function fakeStripe({
  sessionPages = [{ data: [], has_more: false }],
  subscriptionPages = [noSubscriptions, noSubscriptions],
}: { sessionPages?: SessionPage[]; subscriptionPages?: SubscriptionPage[] } = {}) {
  const order: string[] = [];
  const list = vi.fn<Sessions['list']>();
  for (const page of sessionPages) list.mockResolvedValueOnce(page);
  const subscriptionsList = vi.fn<SubscriptionCheckoutStripe['subscriptions']['list']>();
  for (const page of subscriptionPages) subscriptionsList.mockResolvedValueOnce(page);
  const expire = vi.fn<Sessions['expire']>(async id => {
    order.push(`expire:${id}`);
    return {};
  });
  const retrieve = vi.fn<Sessions['retrieve']>(async id => ({ id, status: 'open' }));
  const create = vi.fn(async () => {
    order.push('create');
    return { id: 'cs_new', url: 'https://checkout.stripe.test/cs_new' };
  });
  const stripe: SubscriptionCheckoutStripe = {
    subscriptions: { list: subscriptionsList },
    checkout: { sessions: { list, expire, retrieve } },
  };
  return { stripe, list, expire, retrieve, create, subscriptionsList, order };
}

describe('openSubscriptionCheckout', () => {
  it('expires both open subscription sessions before creating the new one', async () => {
    const fake = fakeStripe({
      sessionPages: [
        { data: [session('cs_a', 'subscription')], has_more: true },
        { data: [session('cs_b', 'subscription')], has_more: false },
      ],
    });

    const result = await openSubscriptionCheckout(fake.stripe, 'cus_1', fake.create);

    expect(fake.list).toHaveBeenNthCalledWith(1, { customer: 'cus_1', status: 'open', limit: 100 });
    expect(fake.list).toHaveBeenNthCalledWith(2, {
      customer: 'cus_1',
      status: 'open',
      limit: 100,
      starting_after: 'cs_a',
    });
    expect(fake.order).toEqual(['expire:cs_a', 'expire:cs_b', 'create']);
    expect(result).toEqual({
      kind: 'created',
      session: { id: 'cs_new', url: 'https://checkout.stripe.test/cs_new' },
      expiredSessionIds: ['cs_a', 'cs_b'],
    });
  });

  it('refuses with a retryable message and creates nothing when an expire fails', async () => {
    const fake = fakeStripe({
      sessionPages: [
        {
          data: [session('cs_a', 'subscription'), session('cs_b', 'subscription')],
          has_more: false,
        },
      ],
    });
    fake.expire.mockRejectedValueOnce(new Error('api_connection_error'));

    const result = await openSubscriptionCheckout(fake.stripe, 'cus_1', fake.create);

    expect(result).toMatchObject({
      kind: 'refused',
      status: 503,
      error: SUBSCRIPTION_CHECKOUT_RETRY_MESSAGE,
    });
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.expire).toHaveBeenCalledTimes(1);
  });

  it('refuses and creates nothing when the open-session list fails', async () => {
    const fake = fakeStripe();
    fake.list.mockReset();
    fake.list.mockRejectedValueOnce(new Error('rate_limit'));

    const result = await openSubscriptionCheckout(fake.stripe, 'cus_1', fake.create);

    expect(result).toMatchObject({ kind: 'refused', status: 503 });
    expect(fake.create).not.toHaveBeenCalled();
  });

  it('refuses when the expire fails and the recheck cannot read the session', async () => {
    const fake = fakeStripe({
      sessionPages: [{ data: [session('cs_a', 'subscription')], has_more: false }],
    });
    fake.expire.mockRejectedValueOnce(new Error('timeout'));
    fake.retrieve.mockRejectedValueOnce(new Error('timeout'));

    const result = await openSubscriptionCheckout(fake.stripe, 'cus_1', fake.create);

    expect(result).toMatchObject({ kind: 'refused', status: 503 });
    expect(fake.create).not.toHaveBeenCalled();
  });

  it.each(['expired', 'complete'])(
    'counts a session that became %s before the expire as done',
    async status => {
      const fake = fakeStripe({
        sessionPages: [{ data: [session('cs_a', 'subscription')], has_more: false }],
      });
      fake.expire.mockRejectedValueOnce(
        new Error('Only Checkout Sessions with a status in ["open"] can be expired.')
      );
      fake.retrieve.mockResolvedValueOnce({ id: 'cs_a', status });

      const result = await openSubscriptionCheckout(fake.stripe, 'cus_1', fake.create);

      expect(fake.retrieve).toHaveBeenCalledWith('cs_a');
      expect(result).toMatchObject({ kind: 'created' });
      expect(fake.create).toHaveBeenCalledTimes(1);
    }
  );

  it('leaves payment-mode sessions alone', async () => {
    const fake = fakeStripe({
      sessionPages: [
        {
          data: [session('cs_entry', 'payment'), session('cs_sub', 'subscription')],
          has_more: false,
        },
      ],
    });

    await openSubscriptionCheckout(fake.stripe, 'cus_1', fake.create);

    expect(fake.expire).toHaveBeenCalledTimes(1);
    expect(fake.expire).toHaveBeenCalledWith('cs_sub');
    expect(fake.expire).not.toHaveBeenCalledWith('cs_entry');
  });

  it('creates as before when the customer has no open sessions', async () => {
    const fake = fakeStripe();

    const result = await openSubscriptionCheckout(fake.stripe, 'cus_1', fake.create);

    expect(fake.expire).not.toHaveBeenCalled();
    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: 'created', expiredSessionIds: [] });
  });

  it('refuses a customer who already holds a subscription without touching sessions', async () => {
    const fake = fakeStripe({
      subscriptionPages: [{ data: [{ id: 'sub_1', status: 'active' }], has_more: false }],
    });

    const result = await openSubscriptionCheckout(fake.stripe, 'cus_1', fake.create);

    expect(result).toMatchObject({
      kind: 'refused',
      status: 400,
      error: SUBSCRIPTION_EXISTS_MESSAGE,
    });
    expect(fake.list).not.toHaveBeenCalled();
    expect(fake.create).not.toHaveBeenCalled();
  });

  it('refuses when a subscription completes during the expiry pass', async () => {
    const fake = fakeStripe({
      sessionPages: [{ data: [], has_more: false }],
      subscriptionPages: [
        noSubscriptions,
        { data: [{ id: 'sub_1', status: 'active' }], has_more: false },
      ],
    });

    const result = await openSubscriptionCheckout(fake.stripe, 'cus_1', fake.create);

    expect(fake.subscriptionsList).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      kind: 'refused',
      status: 400,
      error: SUBSCRIPTION_EXISTS_MESSAGE,
    });
    expect(fake.create).not.toHaveBeenCalled();
  });
});
