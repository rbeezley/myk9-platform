import { describe, expect, it, vi } from 'vitest';
import { hasBlockingSubscription, type SubscriptionLister } from './existingSubscriptionGuard';

type Page = Awaited<ReturnType<SubscriptionLister['subscriptions']['list']>>;

function listerReturning(...pages: Page[]) {
  const list = vi.fn<SubscriptionLister['subscriptions']['list']>();
  for (const page of pages) list.mockResolvedValueOnce(page);
  return { stripe: { subscriptions: { list } }, list };
}

const sub = (id: string, status: string) => ({ id, status });

describe('hasBlockingSubscription', () => {
  it('lists every status for the customer, not only active', async () => {
    const { stripe, list } = listerReturning({ data: [], has_more: false });

    await hasBlockingSubscription(stripe, 'cus_123');

    expect(list).toHaveBeenCalledWith({ customer: 'cus_123', status: 'all', limit: 100 });
  });

  it.each(['active', 'trialing', 'past_due'])('blocks when a subscription is %s', async status => {
    const { stripe } = listerReturning({ data: [sub('sub_1', status)], has_more: false });

    await expect(hasBlockingSubscription(stripe, 'cus_123')).resolves.toBe(true);
  });

  it.each(['incomplete', 'incomplete_expired', 'unpaid', 'canceled', 'paused'])(
    'does not block when the only subscription is %s',
    async status => {
      const { stripe } = listerReturning({ data: [sub('sub_1', status)], has_more: false });

      await expect(hasBlockingSubscription(stripe, 'cus_123')).resolves.toBe(false);
    }
  );

  it('does not block a customer with no subscriptions', async () => {
    const { stripe } = listerReturning({ data: [], has_more: false });

    await expect(hasBlockingSubscription(stripe, 'cus_123')).resolves.toBe(false);
  });

  it('pages past canceled subscriptions to find a trialing one', async () => {
    const { stripe, list } = listerReturning(
      { data: [sub('sub_1', 'canceled'), sub('sub_2', 'canceled')], has_more: true },
      { data: [sub('sub_3', 'trialing')], has_more: false }
    );

    await expect(hasBlockingSubscription(stripe, 'cus_123')).resolves.toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith({
      customer: 'cus_123',
      status: 'all',
      limit: 100,
      starting_after: 'sub_2',
    });
  });

  it('stops paging once a blocking subscription is found', async () => {
    const { stripe, list } = listerReturning({
      data: [sub('sub_1', 'past_due')],
      has_more: true,
    });

    await expect(hasBlockingSubscription(stripe, 'cus_123')).resolves.toBe(true);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
