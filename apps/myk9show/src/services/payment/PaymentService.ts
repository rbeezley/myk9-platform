/**
 * Payment Service
 *
 * Read methods query the stripe_orders / stripe_customers Supabase tables.
 * Write methods (create, confirm, fail, refund) remain stubs — they require
 * server-side Edge Functions that talk to the Stripe API.
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

  async calculateEntryFee(
    showId: string,
    className: string,
    entryDate: Date = new Date(),
    memberDiscount: boolean = false,
    multipleEntryCount: number = 1
  ): Promise<{ baseFee: number; adjustments: Array<{ type: string; amount: number; description: string }>; totalFee: number }> {
    try {
      logger.debug('Calculating entry fee (mock)', 'payment', { showId, className });
      
      const baseFee = 35.00;
      const adjustments: Array<{ type: string; amount: number; description: string }> = [];
      let totalFee = baseFee;

      // Early bird discount
      const earlyBirdDiscount = 10.00;
      const earlyBirdDeadline = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
      if (entryDate <= earlyBirdDeadline) {
        adjustments.push({
          type: 'discount',
          amount: -earlyBirdDiscount,
          description: 'Early Bird Discount'
        });
        totalFee -= earlyBirdDiscount;
      }

      // Member discount
      if (memberDiscount) {
        const discount = 5.00;
        adjustments.push({
          type: 'discount',
          amount: -discount,
          description: 'Member Discount'
        });
        totalFee -= discount;
      }

      // Multiple entry discount
      if (multipleEntryCount > 1) {
        const discountPerAdditionalEntry = 3.00;
        const totalDiscount = discountPerAdditionalEntry * (multipleEntryCount - 1);
        adjustments.push({
          type: 'discount',
          amount: -totalDiscount,
          description: `Multiple Entry Discount (${multipleEntryCount - 1} additional entries)`
        });
        totalFee -= totalDiscount;
      }

      // Ensure minimum fee
      totalFee = Math.max(totalFee, 5.00);

      return { baseFee, adjustments, totalFee };
    } catch (error) {
      logger.error('Failed to calculate entry fee', 'payment', {}, error as Error);
      return {
        baseFee: 35.00,
        adjustments: [],
        totalFee: 35.00
      };
    }
  }

  async createPaymentIntent(
    entryId: string,
    userId: string,
    amount: number,
    currency: string = 'usd',
    description: string,
    metadata: Record<string, unknown> = {}
  ): Promise<{ paymentId: string; clientSecret?: string } | null> {
    try {
      logger.debug('Creating payment intent (stub - needs Edge Function)', 'payment', { entryId, userId, amount, currency, description, metadata });

      return {
        paymentId: 'mock_' + Date.now().toString(),
        clientSecret: 'mock_client_secret_' + Date.now().toString()
      };
    } catch (error) {
      logger.error('Failed to create payment intent', 'payment', {}, error as Error);
      return null;
    }
  }

  async confirmPayment(
    paymentId: string,
    transactionId: string,
    paymentMethodInfo: PaymentMethodInfo
  ): Promise<boolean> {
    try {
      logger.info('Payment confirmed (stub - needs Edge Function)', 'payment', { paymentId, transactionId, paymentMethodInfo });
      return true;
    } catch (error) {
      logger.error('Failed to confirm payment', 'payment', {}, error as Error);
      return false;
    }
  }

  async failPayment(paymentId: string, errorMessage?: string): Promise<boolean> {
    try {
      logger.warn('Payment failed (stub - needs Edge Function)', 'payment', { paymentId, errorMessage });
      return true;
    } catch (error) {
      logger.error('Failed to mark payment as failed', 'payment', {}, error as Error);
      return false;
    }
  }

  async processRefund(
    paymentId: string,
    amount: number,
    reason: string
  ): Promise<string | null> {
    try {
      logger.info('Processing refund (stub - needs Edge Function)', 'payment', { paymentId, amount, reason });
      return 'mock_refund_' + Date.now().toString();
    } catch (error) {
      logger.error('Failed to process refund', 'payment', {}, error as Error);
      return null;
    }
  }

  /**
   * Map a stripe_orders row status string to the PaymentDetails status union.
   */
  private mapOrderStatus(
    status: string | null
  ): PaymentDetails['status'] {
    switch (status) {
      case 'paid':
      case 'completed':
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

      return (data ?? []).map((order) => this.mapOrderToPaymentDetails(order, userId));
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

      let totalAmount = 0;
      let paidAmount = 0;
      let pendingAmount = 0;
      let refundedAmount = 0;
      let paidCount = 0;

      for (const order of data) {
        const amount = order.amount_cents / 100;
        totalAmount += amount;

        const status = this.mapOrderStatus(order.status);
        switch (status) {
          case 'completed':
            paidAmount += amount;
            paidCount++;
            break;
          case 'pending':
          case 'processing':
            pendingAmount += amount;
            break;
          case 'refunded':
            refundedAmount += amount;
            break;
          // failed / cancelled are not counted toward any bucket
        }
      }

      return {
        totalEntries: data.length,
        totalAmount,
        paidAmount,
        pendingAmount,
        refundedAmount,
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

  async testPaymentService(): Promise<boolean> {
    try {
      logger.debug('Payment service test (mock)', 'payment');
      return true;
    } catch (error) {
      logger.error('Payment service test failed', 'payment', {}, error as Error);
      return false;
    }
  }
}

// Export singleton instance
export const paymentService = PaymentService.getInstance();