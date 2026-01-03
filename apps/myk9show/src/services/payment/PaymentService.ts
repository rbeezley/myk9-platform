/**
 * Payment Service - Mock Implementation
 * TODO: Implement proper database integration when payment tables are created
 */

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
      console.log('📊 Calculating entry fee (mock)', { showId, className });
      
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
      console.error('Failed to calculate entry fee:', error);
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
      console.log('💳 Creating payment intent (mock)', { entryId, userId, amount, currency, description, metadata });
      
      return {
        paymentId: 'mock_' + Date.now().toString(),
        clientSecret: 'mock_client_secret_' + Date.now().toString()
      };
    } catch (error) {
      console.error('Failed to create payment intent:', error);
      return null;
    }
  }

  async confirmPayment(
    paymentId: string,
    transactionId: string,
    paymentMethodInfo: PaymentMethodInfo
  ): Promise<boolean> {
    try {
      console.log('✅ Payment confirmed (mock)', { paymentId, transactionId, paymentMethodInfo });
      return true;
    } catch (error) {
      console.error('Failed to confirm payment:', error);
      return false;
    }
  }

  async failPayment(paymentId: string, errorMessage?: string): Promise<boolean> {
    try {
      console.log('❌ Payment failed (mock)', { paymentId, errorMessage });
      return true;
    } catch (error) {
      console.error('Failed to mark payment as failed:', error);
      return false;
    }
  }

  async processRefund(
    paymentId: string,
    amount: number,
    reason: string
  ): Promise<string | null> {
    try {
      console.log('💸 Processing refund (mock)', { paymentId, amount, reason });
      return 'mock_refund_' + Date.now().toString();
    } catch (error) {
      console.error('Failed to process refund:', error);
      return null;
    }
  }

  async getPaymentHistory(userId: string, limit: number = 50): Promise<PaymentDetails[]> {
    try {
      console.log('📋 Loading payment history (mock)', { userId, limit });
      return [];
    } catch (error) {
      console.error('Failed to load payment history:', error);
      return [];
    }
  }

  async getShowPaymentSummary(showId: string): Promise<PaymentSummary> {
    try {
      console.log('📊 Loading payment summary (mock)', { showId });
      return {
        totalEntries: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        refundedAmount: 0,
        completionRate: 0
      };
    } catch (error) {
      console.error('Failed to load payment summary:', error);
      return {
        totalEntries: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        refundedAmount: 0,
        completionRate: 0
      };
    }
  }

  async checkPaymentStatus(paymentId: string): Promise<PaymentDetails | null> {
    try {
      console.log('🔍 Checking payment status (mock)', { paymentId });
      return null;
    } catch (error) {
      console.error('Failed to check payment status:', error);
      return null;
    }
  }

  async generateReceipt(paymentId: string): Promise<PaymentReceipt | null> {
    try {
      console.log('🧾 Generating receipt (mock)', { paymentId });
      return {
        receiptNumber: 'RCPT-' + Date.now().toString(),
        paymentId,
        amount: 35.00,
        currency: 'USD',
        paidAt: new Date()
      };
    } catch (error) {
      console.error('Failed to generate receipt:', error);
      return null;
    }
  }

  async testPaymentService(): Promise<boolean> {
    try {
      console.log('✅ Payment service test (mock)');
      return true;
    } catch (error) {
      console.error('Payment service test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const paymentService = PaymentService.getInstance();