import { describe, expect, it } from 'vitest';
import {
  InvalidEntrySettlementLinesError,
  loadEntrySettlementLinePricesFromStripe,
  loadEntryPaymentLineItemFeesFromStripe,
  readEntryPaymentLineItemFees,
  type EntryPaymentLineItemClient,
} from './entryPaymentLineItems';

describe('entry payment line-item fee reader', () => {
  it('reads complete cart item evidence and omits the separate service-fee line', async () => {
    const client: EntryPaymentLineItemClient = {
      async listLineItems() {
        return {
          data: [
            {
              amount_total: 2_500,
              price: { product: { metadata: { type: 'entry', cart_item_id: 'item-1' } } },
            },
            {
              amount_total: 205,
              price: { product: { metadata: { type: 'platform_fee', cart_item_id: '' } } },
            },
          ],
        };
      },
    };
    await expect(
      loadEntrySettlementLinePricesFromStripe(client, 'cs_1', 'cart_item_id')
    ).resolves.toEqual([{ lineId: 'item-1', priceCents: 2_500 }]);
  });

  it('fails closed on duplicate identified entry lines', async () => {
    const client: EntryPaymentLineItemClient = {
      async listLineItems() {
        return {
          data: [1, 2].map(() => ({
            amount_total: 2_500,
            price: { product: { metadata: { type: 'entry', entry_id: 'entry-1' } } },
          })),
        };
      },
    };
    await expect(
      loadEntrySettlementLinePricesFromStripe(client, 'cs_1', 'entry_id')
    ).rejects.toBeInstanceOf(InvalidEntrySettlementLinesError);
  });

  it('fails closed when Stripe reports more lines than the fetched page', async () => {
    const client = {
      async listLineItems() {
        return {
          has_more: true,
          data: [
            {
              amount_total: 2_500,
              price: { product: { metadata: { type: 'entry', cart_item_id: 'item-1' } } },
            },
          ],
        };
      },
    } as EntryPaymentLineItemClient;
    await expect(
      loadEntrySettlementLinePricesFromStripe(client, 'cs_1', 'cart_item_id')
    ).rejects.toBeInstanceOf(InvalidEntrySettlementLinesError);
  });

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
    expect(calls).toEqual([['cs_test_123', { limit: 100, expand: ['data.price.product'] }]]);
  });
});
