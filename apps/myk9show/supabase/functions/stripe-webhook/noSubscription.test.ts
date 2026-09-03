// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistNoSubscription } from './noSubscription.ts';

describe('persistNoSubscription', () => {
  afterEach(() => vi.restoreAllMocks());

  it('upserts the exact sentinel payload using the unique subscription ID', async () => {
    const db = makeDatabase();

    await persistNoSubscription(db.client, customer, 'cus_stripe');

    expect(db.upsert).toHaveBeenCalledWith(
      { customer_id: 'customer-db-id', stripe_subscription_id: 'none_cus_stripe', status: 'none' },
      { onConflict: 'stripe_subscription_id' }
    );
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.client.from.mock.calls).toEqual([
      ['stripe_subscriptions'],
      ['stripe_subscriptions'],
      ['exhibitor_profiles'],
    ]);
    expect(db.retire).toHaveBeenCalledWith({ status: 'none' });
    expect(db.retireWhere).toHaveBeenCalledWith('customer_id', 'customer-db-id');
    expect(db.downgrade).toHaveBeenCalledWith({
      subscription_tier: 'free',
      subscription_expires_at: null,
    });
    expect(db.profileWhere).toHaveBeenCalledWith('person_id', 'person-db-id');
  });

  it('awaits stale-row retirement before upsert and upsert before profile downgrade', async () => {
    const db = makeDatabase();
    const retired = deferredResult();
    const persisted = deferredResult();
    db.retireWhere.mockReturnValueOnce(retired.promise);
    db.upsert.mockReturnValueOnce(persisted.promise);

    const work = persistNoSubscription(db.client, customer, 'cus_stripe');
    expect(db.retireWhere).toHaveBeenCalledTimes(1);
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.downgrade).not.toHaveBeenCalled();

    retired.resolve({ error: null });
    await retired.promise;
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.downgrade).not.toHaveBeenCalled();

    persisted.resolve({ error: null });
    await work;
    expect(db.downgrade).toHaveBeenCalledTimes(1);
  });

  it('logs a stale-update error and stops before upsert or profile downgrade', async () => {
    const db = makeDatabase();
    const error = { message: 'stale update failed' };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.retireWhere.mockResolvedValueOnce({ error });

    await expect(persistNoSubscription(db.client, customer, 'cus_stripe')).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith('Error clearing stale subscriptions:', error);
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.downgrade).not.toHaveBeenCalled();
    expect(db.client.from).not.toHaveBeenCalledWith('exhibitor_profiles');
  });

  it('logs an upsert error and stops before profile downgrade', async () => {
    const db = makeDatabase();
    const error = { message: 'upsert failed', code: '42P10' };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.upsert.mockResolvedValueOnce({ error });

    await expect(persistNoSubscription(db.client, customer, 'cus_stripe')).resolves.toBeUndefined();

    expect(db.retireWhere).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Error recording missing subscription:', error);
    expect(db.downgrade).not.toHaveBeenCalled();
    expect(db.client.from).not.toHaveBeenCalledWith('exhibitor_profiles');
  });
});

const customer = { id: 'customer-db-id', person_id: 'person-db-id' };
type Result = { error: unknown };

function makeDatabase() {
  const retireWhere = vi.fn<() => Promise<Result>>().mockResolvedValue({ error: null });
  const profileWhere = vi.fn<() => Promise<Result>>().mockResolvedValue({ error: null });
  const retire = vi.fn().mockReturnValue({ eq: retireWhere });
  const downgrade = vi.fn().mockReturnValue({ eq: profileWhere });
  const upsert = vi.fn<() => Promise<Result>>().mockResolvedValue({ error: null });
  const client = {
    from: vi.fn((table: string) => ({
      update: table === 'stripe_subscriptions' ? retire : downgrade,
      upsert,
    })),
  };
  return { client, retire, retireWhere, upsert, downgrade, profileWhere };
}

function deferredResult() {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
