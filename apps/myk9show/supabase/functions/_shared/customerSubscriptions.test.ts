// @vitest-environment node
// MYK9-2497: which of a customer's subscriptions is kept, which are
// duplicates, and which grants the tier.
import { describe, expect, it, vi } from 'vitest';
import {
  entitlingSubscription,
  listAllSubscriptions,
  splitLiveSubscriptions,
} from './customerSubscriptions';

const s = (id: string, status: string, created: number) => ({ id, status, created });

describe('splitLiveSubscriptions', () => {
  it('keeps the oldest live subscription; every newer live one is a duplicate', () => {
    const { kept, duplicates } = splitLiveSubscriptions([
      s('c', 'trialing', 30),
      s('a', 'past_due', 10),
      s('x', 'canceled', 5),
      s('b', 'active', 20),
      s('i', 'incomplete', 40),
    ]);
    expect(kept?.id).toBe('a');
    expect(duplicates.map(d => d.id)).toEqual(['b', 'c']);
  });

  it('breaks a created tie by id, so every event picks the same duplicate', () => {
    const one = splitLiveSubscriptions([s('sub_b', 'active', 10), s('sub_a', 'active', 10)]);
    const two = splitLiveSubscriptions([s('sub_a', 'active', 10), s('sub_b', 'active', 10)]);
    expect(one.duplicates.map(d => d.id)).toEqual(['sub_b']);
    expect(two.duplicates.map(d => d.id)).toEqual(['sub_b']);
  });

  it('has no duplicates for one live subscription, and no kept one for none', () => {
    expect(splitLiveSubscriptions([s('a', 'active', 1)]).duplicates).toEqual([]);
    expect(splitLiveSubscriptions([s('a', 'canceled', 1)])).toEqual({ kept: null, duplicates: [] });
  });
});

describe('entitlingSubscription', () => {
  it('is the kept (oldest live) subscription when it is active or trialing', () => {
    expect(
      entitlingSubscription([s('b', 'active', 20), s('x', 'canceled', 1), s('c', 'trialing', 30)])
        ?.id
    ).toBe('b');
    expect(entitlingSubscription([s('c', 'trialing', 30)])?.id).toBe('c');
  });

  it('is null when the kept subscription is past_due, even beside an active duplicate', () => {
    expect(entitlingSubscription([s('b', 'active', 20), s('a', 'past_due', 10)])).toBeNull();
    expect(entitlingSubscription([s('a', 'past_due', 10), s('x', 'canceled', 1)])).toBeNull();
  });
});

describe('listAllSubscriptions', () => {
  it('follows pagination', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [s('a', 'active', 1)], has_more: true })
      .mockResolvedValueOnce({ data: [s('b', 'canceled', 2)], has_more: false });

    const all = await listAllSubscriptions({ subscriptions: { list } }, 'cus_1');

    expect(all.map(x => x.id)).toEqual(['a', 'b']);
    expect(list).toHaveBeenNthCalledWith(2, {
      customer: 'cus_1',
      status: 'all',
      limit: 100,
      starting_after: 'a',
    });
  });
});
