import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { PaymentService } from './PaymentService';

/**
 * Builds a chainable Supabase query-builder stub. Every chain method
 * (select/eq/order) returns the same builder so calls can be composed in
 * any order the production code uses. `limit`/`maybeSingle` are terminal
 * and resolve to `result`; the builder is also directly thenable so code
 * that awaits the builder without a terminal call (e.g. `.eq(...)` as the
 * last call) still resolves to `result`.
 */
function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe('PaymentService read methods', () => {
  const service = PaymentService.getInstance();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPaymentHistory', () => {
    it('returns [] and does not query stripe_orders when no stripe_customers row exists for the user', async () => {
      mocks.from.mockImplementation((table: string) => {
        if (table === 'stripe_customers') {
          return makeQueryBuilder({ data: null, error: null });
        }
        throw new Error(`unexpected table: ${table}`);
      });

      const result = await service.getPaymentHistory('user-1');

      expect(result).toEqual([]);
      expect(mocks.from).toHaveBeenCalledWith('stripe_customers');
      expect(mocks.from).not.toHaveBeenCalledWith('stripe_orders');
    });

    it('returns [] when the stripe_customers lookup errors, without querying stripe_orders', async () => {
      mocks.from.mockImplementation((table: string) => {
        if (table === 'stripe_customers') {
          return makeQueryBuilder({ data: null, error: new Error('db down') });
        }
        throw new Error(`unexpected table: ${table}`);
      });

      const result = await service.getPaymentHistory('user-1');

      expect(result).toEqual([]);
      expect(mocks.from).not.toHaveBeenCalledWith('stripe_orders');
    });

    it('returns [] when the stripe_orders query errors', async () => {
      mocks.from.mockImplementation((table: string) => {
        if (table === 'stripe_customers') {
          return makeQueryBuilder({ data: { id: 'cust-1' }, error: null });
        }
        if (table === 'stripe_orders') {
          return makeQueryBuilder({ data: null, error: new Error('query failed') });
        }
        throw new Error(`unexpected table: ${table}`);
      });

      const result = await service.getPaymentHistory('user-1');

      expect(result).toEqual([]);
    });

    it('scopes the lookup to the caller: person_id on customers, customer_id on orders, with order+limit', async () => {
      const customersBuilder = makeQueryBuilder({ data: { id: 'cust-1' }, error: null });
      const ordersBuilder = makeQueryBuilder({ data: [], error: null });
      mocks.from.mockImplementation((table: string) =>
        table === 'stripe_customers' ? customersBuilder : ordersBuilder
      );

      await service.getPaymentHistory('user-1');

      expect(customersBuilder.eq).toHaveBeenCalledWith('person_id', 'user-1');
      expect(ordersBuilder.eq).toHaveBeenCalledWith('customer_id', 'cust-1');
      expect(ordersBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(ordersBuilder.limit).toHaveBeenCalledWith(50);
    });

    it('maps stripe_orders rows to PaymentDetails, using the caller userId as the person id', async () => {
      const orderRow = {
        id: 'order-1',
        entry_ids: ['entry-1', 'entry-2'],
        customer_id: 'cust-1',
        amount_cents: 3500,
        currency: 'usd',
        status: 'paid',
        stripe_payment_intent_id: 'pi_123',
        order_type: 'entry_fee',
        metadata: { note: 'x' },
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-02T00:00:00.000Z',
      };

      mocks.from.mockImplementation((table: string) => {
        if (table === 'stripe_customers') {
          return makeQueryBuilder({ data: { id: 'cust-1' }, error: null });
        }
        if (table === 'stripe_orders') {
          return makeQueryBuilder({ data: [orderRow], error: null });
        }
        throw new Error(`unexpected table: ${table}`);
      });

      const result = await service.getPaymentHistory('user-1');

      expect(result).toEqual([
        {
          id: 'order-1',
          entryId: 'entry-1',
          userId: 'user-1',
          amount: 35,
          currency: 'USD',
          status: 'completed',
          transactionId: 'pi_123',
          description: 'entry_fee',
          metadata: { note: 'x' },
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-02T00:00:00.000Z'),
        },
      ]);
    });

    // REGRESSION: 'succeeded' is the status stripe_orders actually writes for a
    // captured payment, and it was missing from mapOrderStatus — so every
    // successful payment read as "pending" in payment history. A PARTIALLY
    // refunded order also stays 'succeeded' (only a FULL refund flips the
    // status), so partial refunds fell into the same hole.
    it.each([
      ['succeeded', 0],
      ['succeeded', 1500],
    ])('maps a %s order (refunded %i¢) to completed, never pending', async (status, refunded) => {
      const orderRow = {
        id: 'order-1',
        entry_ids: ['entry-1'],
        customer_id: 'cust-1',
        amount_cents: 3500,
        refunded_cents: refunded,
        currency: 'usd',
        status,
        stripe_payment_intent_id: 'pi_123',
        order_type: 'entry_fee',
        metadata: {},
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-02T00:00:00.000Z',
      };

      mocks.from.mockImplementation((table: string) => {
        if (table === 'stripe_customers') {
          return makeQueryBuilder({ data: { id: 'cust-1' }, error: null });
        }
        if (table === 'stripe_orders') {
          return makeQueryBuilder({ data: [orderRow], error: null });
        }
        throw new Error(`unexpected table: ${table}`);
      });

      const result = await service.getPaymentHistory('user-1');
      expect(result[0]?.status).toBe('completed');
    });

    it('still maps a genuinely pending order to pending', async () => {
      const orderRow = {
        id: 'order-1',
        entry_ids: ['entry-1'],
        customer_id: 'cust-1',
        amount_cents: 3500,
        currency: 'usd',
        status: 'pending',
        stripe_payment_intent_id: 'pi_123',
        order_type: 'entry_fee',
        metadata: {},
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-02T00:00:00.000Z',
      };

      mocks.from.mockImplementation((table: string) => {
        if (table === 'stripe_customers') {
          return makeQueryBuilder({ data: { id: 'cust-1' }, error: null });
        }
        if (table === 'stripe_orders') {
          return makeQueryBuilder({ data: [orderRow], error: null });
        }
        throw new Error(`unexpected table: ${table}`);
      });

      const result = await service.getPaymentHistory('user-1');
      expect(result[0]?.status).toBe('pending');
    });
  });

  describe('getShowPaymentSummary', () => {
    const emptySummary = {
      totalEntries: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      refundedAmount: 0,
      completionRate: 0,
    };

    it('returns the empty summary when the query errors', async () => {
      mocks.from.mockReturnValue(makeQueryBuilder({ data: null, error: new Error('boom') }));

      await expect(service.getShowPaymentSummary('show-1')).resolves.toEqual(emptySummary);
    });

    it('returns the empty summary when there are no orders', async () => {
      mocks.from.mockReturnValue(makeQueryBuilder({ data: [], error: null }));

      await expect(service.getShowPaymentSummary('show-1')).resolves.toEqual(emptySummary);
    });

    it('filters orders by show_id', async () => {
      const builder = makeQueryBuilder({ data: [], error: null });
      mocks.from.mockReturnValue(builder);

      await service.getShowPaymentSummary('show-1');

      expect(mocks.from).toHaveBeenCalledWith('stripe_orders');
      expect(builder.eq).toHaveBeenCalledWith('show_id', 'show-1');
    });

    it('buckets amounts by status and computes completionRate from completed orders only', async () => {
      mocks.from.mockReturnValue(
        makeQueryBuilder({
          data: [
            { amount_cents: 3500, status: 'paid' },
            { amount_cents: 3500, status: 'pending' },
            { amount_cents: 3500, status: 'processing' },
            { amount_cents: 3500, status: 'refunded' },
            { amount_cents: 3500, status: 'failed' },
            { amount_cents: 3500, status: 'cancelled' },
          ],
          error: null,
        })
      );

      const result = await service.getShowPaymentSummary('show-1');

      expect(result).toEqual({
        totalEntries: 6,
        totalAmount: 210,
        paidAmount: 35,
        pendingAmount: 70,
        refundedAmount: 35,
        completionRate: 1 / 6,
      });
    });
  });

  describe('checkPaymentStatus', () => {
    it('returns null when no matching order exists', async () => {
      mocks.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));

      await expect(service.checkPaymentStatus('order-1')).resolves.toBeNull();
    });

    it('returns null when the query errors', async () => {
      mocks.from.mockReturnValue(makeQueryBuilder({ data: null, error: new Error('boom') }));

      await expect(service.checkPaymentStatus('order-1')).resolves.toBeNull();
    });

    it('filters by the requested payment id', async () => {
      const builder = makeQueryBuilder({ data: null, error: null });
      mocks.from.mockReturnValue(builder);

      await service.checkPaymentStatus('order-1');

      expect(builder.eq).toHaveBeenCalledWith('id', 'order-1');
    });

    it('extracts the person_id from the joined stripe_customers record', async () => {
      mocks.from.mockReturnValue(
        makeQueryBuilder({
          data: {
            id: 'order-1',
            entry_ids: ['entry-1'],
            customer_id: 'cust-1',
            amount_cents: 3500,
            currency: 'usd',
            status: 'pending',
            stripe_payment_intent_id: null,
            order_type: null,
            metadata: null,
            created_at: null,
            updated_at: null,
            stripe_customers: { person_id: 'person-1' },
          },
          error: null,
        })
      );

      const result = await service.checkPaymentStatus('order-1');

      expect(result?.userId).toBe('person-1');
      expect(result?.status).toBe('pending');
    });

    it('falls back to customer_id for userId when no joined customer record is present', async () => {
      mocks.from.mockReturnValue(
        makeQueryBuilder({
          data: {
            id: 'order-1',
            entry_ids: ['entry-1'],
            customer_id: 'cust-1',
            amount_cents: 3500,
            currency: 'usd',
            status: 'pending',
            stripe_payment_intent_id: null,
            order_type: null,
            metadata: null,
            created_at: null,
            updated_at: null,
            stripe_customers: null,
          },
          error: null,
        })
      );

      const result = await service.checkPaymentStatus('order-1');

      expect(result?.userId).toBe('cust-1');
    });
  });

  describe('generateReceipt', () => {
    it('returns null when the order does not exist', async () => {
      mocks.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));

      await expect(service.generateReceipt('order-1')).resolves.toBeNull();
    });

    it('returns null when the query errors', async () => {
      mocks.from.mockReturnValue(makeQueryBuilder({ data: null, error: new Error('boom') }));

      await expect(service.generateReceipt('order-1')).resolves.toBeNull();
    });

    it('filters by the requested payment id', async () => {
      const builder = makeQueryBuilder({ data: null, error: null });
      mocks.from.mockReturnValue(builder);

      await service.generateReceipt('order-1');

      expect(builder.eq).toHaveBeenCalledWith('id', 'order-1');
    });

    it('refuses to generate a receipt for a non-completed order', async () => {
      mocks.from.mockReturnValue(
        makeQueryBuilder({
          data: {
            id: 'order-1',
            amount_cents: 3500,
            currency: 'usd',
            status: 'pending',
            paid_at: null,
            created_at: '2026-07-01T00:00:00.000Z',
          },
          error: null,
        })
      );

      await expect(service.generateReceipt('order-1')).resolves.toBeNull();
    });

    it('generates a receipt for a completed order, preferring paid_at over created_at', async () => {
      mocks.from.mockReturnValue(
        makeQueryBuilder({
          data: {
            id: 'order-12345678',
            amount_cents: 3500,
            currency: 'usd',
            status: 'paid',
            paid_at: '2026-07-03T00:00:00.000Z',
            created_at: '2026-07-01T00:00:00.000Z',
          },
          error: null,
        })
      );

      const receipt = await service.generateReceipt('order-12345678');

      expect(receipt).toEqual({
        receiptNumber: 'RCPT-ORDER-12',
        paymentId: 'order-12345678',
        amount: 35,
        currency: 'USD',
        paidAt: new Date('2026-07-03T00:00:00.000Z'),
      });
    });

    it('falls back to created_at when paid_at is missing on a completed order', async () => {
      mocks.from.mockReturnValue(
        makeQueryBuilder({
          data: {
            id: 'order-12345678',
            amount_cents: 3500,
            currency: 'usd',
            status: 'completed',
            paid_at: null,
            created_at: '2026-07-01T00:00:00.000Z',
          },
          error: null,
        })
      );

      const receipt = await service.generateReceipt('order-12345678');

      expect(receipt?.paidAt).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    });
  });
});
