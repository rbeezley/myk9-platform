/**
 * Payment Service
 *
 * Read-only: queries the stripe_orders / stripe_customers Supabase tables
 * (webhook-written state). All money movement goes through the stripe-*
 * edge functions — this service must never grow client-side write paths.
 */

import { logger } from '@/services/LoggingService';
import { supabase } from '@/lib/supabase';

export interface PaymentDetails {
  id: string;
  entryId: string;
  userId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled';
  paymentMethod?: string;
  transactionId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentSummary {
  totalEntries: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  refundedAmount: number;
  completionRate: number;
}

export interface PaymentMethodInfo {
  type: string;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
}

export interface RefundDetails {
  id: string;
  originalPaymentId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  refundId?: string;
  processedAt?: Date;
  createdAt: Date;
}

export interface PaymentReceipt {
  receiptNumber: string;
  paymentId: string;
  amount: number;
  currency: string;
  paidAt: Date;
  receiptUrl?: string;
}

export class PaymentService {
  private static instance: PaymentService;

  private constructor() {}

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  // MP-25: the mock write-path stubs (createPaymentIntent, confirmPayment,
  // failPayment, processRefund, calculateEntryFee) were deleted — they faked
  // success and would silently swallow real money operations if ever wired.
  // All real money movement goes through the stripe-* edge functions; this
  // service only READS webhook-written payment state.

  /**
   * Map a stripe_orders row status string to the PaymentDetails status union.
   */
  private mapOrderStatus(status: string | null): PaymentDetails['status'] {
    switch (status) {
      case 'paid':
      case 'completed':
      // 'succeeded' is the status stripe_orders ACTUALLY writes for a captured
      // payment; it was missing here, so every successful payment fell through
      // to `default` and read as "pending" in payment history. A PARTIALLY
      // refunded order also stays 'succeeded' by the refund-attribution
      // invariant (migration 20260717120000 — only a FULL refund flips the
      // status), so it lands here too and reads as completed rather than
      // pending. A distinct "partially refunded" display state would be more
      // informative, but the PaymentDetails['status'] union has no such member
      // and adding one is out of scope for this fix.
      case 'succeeded':
        return 'completed';
      case 'pending':
        return 'pending';
      case 'processing':
        return 'processing';
      case 'failed':
        return 'failed';
      case 'refunded':
        return 'refunded';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  /**
   * Convert a stripe_orders row into a PaymentDetails object.
   */
  private mapOrderToPaymentDetails(
    order: {
      id: string;
      entry_ids: string[] | null;
      customer_id: string | null;
      amount_cents: number;
      currency: string | null;
      status: string | null;
      stripe_payment_intent_id: string | null;
      order_type: string | null;
      metadata: unknown;
      created_at: string | null;
      updated_at: string | null;
    },
    personId?: string
  ): PaymentDetails {
    const details: PaymentDetails = {
      id: order.id,
      entryId: order.entry_ids?.[0] ?? '',
      userId: personId ?? order.customer_id ?? '',
      amount: order.amount_cents / 100,
      currency: (order.currency ?? 'usd').toUpperCase(),
      status: this.mapOrderStatus(order.status),
      createdAt: order.created_at ? new Date(order.created_at) : new Date(),
      updatedAt: order.updated_at ? new Date(order.updated_at) : new Date(),
    };

    if (order.stripe_payment_intent_id) {
      details.transactionId = order.stripe_payment_intent_id;
    }
    if (order.order_type) {
      details.description = order.order_type;
    }
    if (order.metadata) {
      details.metadata = order.metadata as Record<string, unknown>;
    }

    return details;
  }

  async getPaymentHistory(userId: string, limit: number = 50): Promise<PaymentDetails[]> {
    try {
      logger.debug('Loading payment history', 'payment', { userId, limit });

      // Look up the stripe_customers record for this user (person_id)
      const { data: customer, error: customerError } = await supabase
        .from('stripe_customers')
        .select('id')
        .eq('person_id', userId)
        .maybeSingle();

      if (customerError) {
        logger.error('Failed to look up stripe customer', 'payment', { userId }, customerError);
        return [];
      }

      if (!customer) {
        logger.debug('No stripe customer found for user', 'payment', { userId });
        return [];
      }

      const { data, error } = await supabase
        .from('stripe_orders')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to query stripe_orders', 'payment', { userId }, error);
        return [];
      }

      return (data ?? []).map(order => this.mapOrderToPaymentDetails(order, userId));
    } catch (error) {
      logger.error('Failed to load payment history', 'payment', {}, error as Error);
      return [];
    }
  }

  async getShowPaymentSummary(showId: string): Promise<PaymentSummary> {
    const emptySummary: PaymentSummary = {
      totalEntries: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      refundedAmount: 0,
      completionRate: 0,
    };

    try {
      logger.debug('Loading payment summary', 'payment', { showId });

      const { data, error } = await supabase
        .from('stripe_orders')
        .select('*')
        .eq('show_id', showId);

      if (error) {
        logger.error('Failed to query stripe_orders for show', 'payment', { showId }, error);
        return emptySummary;
      }

      if (!data || data.length === 0) {
        return emptySummary;
      }

      // Accumulate in integer cents and divide once — summing binary-float
      // dollars drifts by a penny on large shows (MP-26).
      let totalCents = 0;
      let paidCents = 0;
      let pendingCents = 0;
      let refundedCents = 0;
      let paidCount = 0;

      for (const order of data) {
        const cents = order.amount_cents;
        totalCents += cents;

        const status = this.mapOrderStatus(order.status);
        switch (status) {
          case 'completed':
            paidCents += cents;
            paidCount++;
            break;
          case 'pending':
          case 'processing':
            pendingCents += cents;
            break;
          case 'refunded':
            refundedCents += cents;
            break;
          // failed / cancelled are not counted toward any bucket
        }
      }

      return {
        totalEntries: data.length,
        totalAmount: totalCents / 100,
        paidAmount: paidCents / 100,
        pendingAmount: pendingCents / 100,
        refundedAmount: refundedCents / 100,
        completionRate: data.length > 0 ? paidCount / data.length : 0,
      };
    } catch (error) {
      logger.error('Failed to load payment summary', 'payment', {}, error as Error);
      return emptySummary;
    }
  }

  async checkPaymentStatus(paymentId: string): Promise<PaymentDetails | null> {
    try {
      logger.debug('Checking payment status', 'payment', { paymentId });

      const { data, error } = await supabase
        .from('stripe_orders')
        .select('*, stripe_customers!stripe_orders_customer_id_fkey(person_id)')
        .eq('id', paymentId)
        .maybeSingle();

      if (error) {
        logger.error('Failed to query stripe_orders', 'payment', { paymentId }, error);
        return null;
      }

      if (!data) {
        return null;
      }

      // Extract person_id from the joined stripe_customers record
      const customer = data.stripe_customers as { person_id: string } | null;
      const personId = customer?.person_id;

      return this.mapOrderToPaymentDetails(data, personId ?? undefined);
    } catch (error) {
      logger.error('Failed to check payment status', 'payment', {}, error as Error);
      return null;
    }
  }

  async generateReceipt(paymentId: string): Promise<PaymentReceipt | null> {
    try {
      logger.debug('Generating receipt', 'payment', { paymentId });

      const { data, error } = await supabase
        .from('stripe_orders')
        .select('*')
        .eq('id', paymentId)
        .maybeSingle();

      if (error) {
        logger.error('Failed to query stripe_orders for receipt', 'payment', { paymentId }, error);
        return null;
      }

      if (!data) {
        return null;
      }

      // Only generate receipts for paid orders
      const status = this.mapOrderStatus(data.status);
      if (status !== 'completed') {
        logger.warn('Cannot generate receipt for non-completed order', 'payment', {
          paymentId,
          status: data.status,
        });
        return null;
      }

      return {
        receiptNumber: `RCPT-${data.id.slice(0, 8).toUpperCase()}`,
        paymentId: data.id,
        amount: data.amount_cents / 100,
        currency: (data.currency ?? 'usd').toUpperCase(),
        paidAt: data.paid_at ? new Date(data.paid_at) : new Date(data.created_at ?? Date.now()),
      };
    } catch (error) {
      logger.error('Failed to generate receipt', 'payment', {}, error as Error);
      return null;
    }
  }
}

// Export singleton instance
export const paymentService = PaymentService.getInstance();
