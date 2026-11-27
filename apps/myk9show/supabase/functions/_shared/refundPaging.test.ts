import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listAllIntentRefunds, type RefundPage, type RefundPageParams } from './refundPaging.ts';
import { findReusableRefund, refundAttemptCount, type PriorRefund } from './refundReuse.ts';
import {
  findReusableShowRefund,
  showRefundAttemptCount,
  type PriorShowRefund,
} from './showRefundReuse.ts';

/** A fake `stripe.refunds.list` serving `pages` in order, recording each call. */
function pagedList<T extends { id: string }>(pages: T[][]) {
  const calls: RefundPageParams[] = [];
  const list = async (params: RefundPageParams): Promise<RefundPage<T>> => {
    calls.push(params);
    const index = calls.length - 1;
    return { data: pages[index], has_more: index < pages.length - 1 };
  };
  return { list, calls };
}

function filler(count: number): PriorRefund[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `re_other_${i}`,
    status: 'succeeded',
    metadata: { entry_id: `other-${i}` },
  }));
}

describe('listAllIntentRefunds', () => {
  it('walks starting_after from the last id of each page until has_more is false', async () => {
    const { list, calls } = pagedList([[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }], [{ id: 'd' }]]);
    const all = await listAllIntentRefunds(list, 'pi_1');
    expect(all.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(calls).toEqual([
      { payment_intent: 'pi_1', limit: 100 },
      { payment_intent: 'pi_1', limit: 100, starting_after: 'b' },
      { payment_intent: 'pi_1', limit: 100, starting_after: 'c' },
    ]);
  });

  it('stops on an empty page even if has_more is claimed', async () => {
    const calls: RefundPageParams[] = [];
    const all = await listAllIntentRefunds(async params => {
      calls.push(params);
      return { data: [], has_more: true };
    }, 'pi_1');
    expect(all).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('stripe-refund-entry decision over every page', () => {
  it('reuses a live refund for the entry that sits on the second page', async () => {
    const live: PriorRefund = { id: 're_live', status: 'pending', metadata: { entry_id: 'e-1' } };
    const { list, calls } = pagedList([filler(100), [live]]);
    const prior = await listAllIntentRefunds(list, 'pi_entry');
    expect(calls[1]).toEqual({
      payment_intent: 'pi_entry',
      limit: 100,
      starting_after: 're_other_99',
    });
    expect(findReusableRefund(prior, 'e-1')).toBe(live);
  });

  it('counts a second-page dead attempt so the idempotency key moves on', async () => {
    const dead: PriorRefund = { id: 're_dead', status: 'failed', metadata: { entry_id: 'e-1' } };
    const { list } = pagedList([filler(100), [dead]]);
    const prior = await listAllIntentRefunds(list, 'pi_entry');
    expect(findReusableRefund(prior, 'e-1')).toBeUndefined();
    expect(refundAttemptCount(prior, 'e-1')).toBe(1);
  });
});

describe('stripe-refund-show decision over every page', () => {
  const others: PriorShowRefund[] = Array.from({ length: 100 }, (_, i) => ({
    id: `re_other_${i}`,
    status: 'succeeded',
    metadata: {},
  }));

  it('reuses a live show refund that sits on the second page', async () => {
    const live: PriorShowRefund = {
      id: 're_show',
      status: 'succeeded',
      metadata: { show_refund: 's-1' },
    };
    const { list, calls } = pagedList([others, [live]]);
    const prior = await listAllIntentRefunds(list, 'pi_show');
    expect(calls).toHaveLength(2);
    expect(findReusableShowRefund(prior, 's-1')).toBe(live);
  });

  it('counts a second-page canceled show refund toward the attempt number', async () => {
    const dead: PriorShowRefund = {
      id: 're_show_dead',
      status: 'canceled',
      metadata: { show_refund: 's-1' },
    };
    const { list } = pagedList([others, [dead]]);
    const prior = await listAllIntentRefunds(list, 'pi_show');
    expect(findReusableShowRefund(prior, 's-1')).toBeUndefined();
    expect(showRefundAttemptCount(prior, 's-1')).toBe(1);
  });
});

// index.ts reads Deno.env at module scope and cannot be imported under vitest,
// so the wiring is pinned against the source text (convention #624).
describe('refund functions read every page (source-pinned)', () => {
  for (const fn of ['stripe-refund-entry', 'stripe-refund-show', 'stripe-approve-refund']) {
    it(`${fn} never makes a single-page refunds.list call`, () => {
      const source = readFileSync(resolve(__dirname, `../${fn}/index.ts`), 'utf8');
      const listCalls = source.match(/stripe\.refunds\.list\([^)]*\)/g) ?? [];
      expect(listCalls.length).toBeGreaterThan(0);
      // Only the page loader handed to the walker: `stripe.refunds.list(params)`.
      expect(listCalls.every(call => call === 'stripe.refunds.list(params)')).toBe(true);
    });
  }
});
