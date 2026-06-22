import { describe, expect, it } from 'vitest';
import {
  loadEntryPaymentLineItemFeesFromStripe,
  readEntryPaymentLineItemFees,
  type EntryPaymentLineItemClient,
} from './entryPaymentLineItems';

describe('entry payment line-item fee reader', () => {
  it('reads entry ids from expanded Stripe price product metadata', () => {
    const fees = readEntryPaymentLineItemFees([
      {
        amount_total: 5_000,
        price: { product: { metadata: { type: 'entry', entry_id: 'entry-1' } } },
      },
      {
        amount_total: 6_000,
        price: { product: { metadata: { type: 'entry', entry_id: 'entry-2' } } },
      },
      {
        amount_total: 770,
        price: { product: { metadata: { type: 'platform_fee' } } },
      },
    ]);

    expect(fees).toEqual(
      new Map([
        ['entry-1', 5_000],
        ['entry-2', 6_000],
      ])
    );
  });

  it('requests expanded price products from Stripe before reading fees', async () => {
    const calls: unknown[] = [];
    const client: EntryPaymentLineItemClient = {
      async listLineItems(sessionId, params) {
        calls.push([sessionId, params]);
        return {
          data: [
            {
              amount_total: 3_000,
              price: { product: { metadata: { entry_id: 'entry-1' } } },
            },
          ],
        };
      },
    };

    await expect(loadEntryPaymentLineItemFeesFromStripe(client, 'cs_test_123')).resolves.toEqual(
      new Map([['entry-1', 3_000]])
    );
    expect(calls).toEqual([
      ['cs_test_123', { limit: 100, expand: ['data.price.product'] }],
    ]);
  });
});
