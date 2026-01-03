/**
 * Hook for payment processing in the dog show management system
 */

import { useState, useCallback } from 'react';
import { 
  paymentService, 
  PaymentDetails, 
  PaymentSummary,
  PaymentMethodInfo 
} from '@/services/payment/PaymentService';

interface PaymentState {
  loading: boolean;
  error: string | null;
  success: boolean;
  paymentId: string | null;
  clientSecret: string | null;
}

interface FeeCalculation {
  baseFee: number;
  adjustments: Array<{ type: string; amount: number; description: string }>;
  totalFee: number;
}

export function usePaymentProcessing() {
  const [state, setState] = useState<PaymentState>({
    loading: false,
    error: null,
    success: false,
    paymentId: null,
    clientSecret: null
  });

  const [feeCalculation, setFeeCalculation] = useState<FeeCalculation | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentDetails[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);

  /**
   * Calculate entry fee with discounts and adjustments
   */
  const calculateFee = useCallback(async (
    showId: string,
    className: string,
    memberDiscount: boolean = false,
    multipleEntryCount: number = 1,
    entryDate: Date = new Date()
  ): Promise<FeeCalculation | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const calculation = await paymentService.calculateEntryFee(
        showId,
        className,
        entryDate,
        memberDiscount,
        multipleEntryCount
      );

      setFeeCalculation(calculation);
      setState(prev => ({ ...prev, loading: false }));
      
      console.log('💰 Fee calculated:', calculation);
      return calculation;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Fee calculation failed';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      console.error('Fee calculation error:', error);
      return null;
    }
  }, []);

  /**
   * Create payment intent for processing
   */
  const createPayment = useCallback(async (
    entryId: string,
    userId: string,
    amount: number,
    description: string,
    currency: string = 'usd',
    metadata: Record<string, unknown> = {}
  ): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null, success: false }));

    try {
      const result = await paymentService.createPaymentIntent(
        entryId,
        userId,
        amount,
        currency,
        description,
        metadata
      );

      if (!result) {
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Failed to create payment', 
          success: false 
        }));
        return false;
      }

      setState(prev => ({
        ...prev,
        loading: false,
        success: true,
        paymentId: result.paymentId,
        clientSecret: result.clientSecret || null
      }));

      console.log('💳 Payment created:', result);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payment creation failed';
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage, 
        success: false 
      }));
      console.error('Payment creation error:', error);
      return false;
    }
  }, []);

  /**
   * Confirm successful payment
   */
  const confirmPayment = useCallback(async (
    paymentId: string,
    transactionId: string,
    paymentMethodInfo: PaymentMethodInfo
  ): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const success = await paymentService.confirmPayment(
        paymentId,
        transactionId,
        paymentMethodInfo
      );

      setState(prev => ({ 
        ...prev, 
        loading: false, 
        success,
        error: success ? null : 'Payment confirmation failed'
      }));

      if (success) {
        console.log('✅ Payment confirmed:', paymentId);
      } else {
        console.error('❌ Payment confirmation failed:', paymentId);
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payment confirmation failed';
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage, 
        success: false 
      }));
      console.error('Payment confirmation error:', error);
      return false;
    }
  }, []);

  /**
   * Mark payment as failed
   */
  const failPayment = useCallback(async (
    paymentId: string,
    errorMessage?: string
  ): Promise<boolean> => {
    try {
      const success = await paymentService.failPayment(paymentId, errorMessage);
      
      if (success) {
        setState(prev => ({ 
          ...prev, 
          error: errorMessage || 'Payment failed', 
          success: false 
        }));
        console.log('❌ Payment marked as failed:', paymentId);
      }

      return success;
    } catch (error) {
      console.error('Error marking payment as failed:', error);
      return false;
    }
  }, []);

  /**
   * Process refund
   */
  const processRefund = useCallback(async (
    paymentId: string,
    amount: number,
    reason: string,
    userId: string
  ): Promise<string | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      console.log('Processing refund for user:', userId);
      const refundId = await paymentService.processRefund(
        paymentId,
        amount,
        reason
      );

      setState(prev => ({ 
        ...prev, 
        loading: false,
        success: !!refundId,
        error: refundId ? null : 'Refund processing failed'
      }));

      if (refundId) {
        console.log('💸 Refund processed:', refundId);
      } else {
        console.error('❌ Refund processing failed');
      }

      return refundId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Refund processing failed';
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage, 
        success: false 
      }));
      console.error('Refund processing error:', error);
      return null;
    }
  }, []);

  /**
   * Load payment history for user
   */
  const loadPaymentHistory = useCallback(async (
    userId: string,
    limit: number = 50
  ): Promise<void> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const history = await paymentService.getPaymentHistory(userId, limit);
      setPaymentHistory(history);
      setState(prev => ({ ...prev, loading: false }));
      
      console.log(`📋 Loaded ${history.length} payment records`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load payment history';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      console.error('Payment history error:', error);
    }
  }, []);

  /**
   * Load payment summary for show
   */
  const loadPaymentSummary = useCallback(async (showId: string): Promise<void> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const summary = await paymentService.getShowPaymentSummary(showId);
      setPaymentSummary(summary);
      setState(prev => ({ ...prev, loading: false }));
      
      console.log('📊 Payment summary loaded:', summary);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load payment summary';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      console.error('Payment summary error:', error);
    }
  }, []);

  /**
   * Check payment status
   */
  const checkPaymentStatus = useCallback(async (
    paymentId: string
  ): Promise<PaymentDetails | null> => {
    try {
      const payment = await paymentService.checkPaymentStatus(paymentId);
      
      if (payment) {
        console.log('🔍 Payment status checked:', payment.status);
      } else {
        console.warn('⚠️ Payment not found:', paymentId);
      }

      return payment;
    } catch (error) {
      console.error('Payment status check error:', error);
      return null;
    }
  }, []);

  /**
   * Generate payment receipt
   */
  const generateReceipt = useCallback(async (paymentId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const receipt = await paymentService.generateReceipt(paymentId);
      setState(prev => ({ ...prev, loading: false }));

      if (receipt) {
        console.log('🧾 Receipt generated:', receipt.receiptNumber);
      } else {
        console.error('❌ Receipt generation failed');
      }

      return receipt;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Receipt generation failed';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      console.error('Receipt generation error:', error);
      return null;
    }
  }, []);

  /**
   * Test payment service
   */
  const testPaymentService = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const success = await paymentService.testPaymentService();
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        success,
        error: success ? null : 'Payment service test failed'
      }));

      if (success) {
        console.log('✅ Payment service test successful');
      } else {
        console.error('❌ Payment service test failed');
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payment service test failed';
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage, 
        success: false 
      }));
      console.error('Payment service test error:', error);
      return false;
    }
  }, []);

  /**
   * Clear payment state
   */
  const clearState = useCallback(() => {
    setState({
      loading: false,
      error: null,
      success: false,
      paymentId: null,
      clientSecret: null
    });
    setFeeCalculation(null);
  }, []);

  /**
   * Format currency amount
   */
  const formatCurrency = useCallback((amount: number, currency: string = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  }, []);

  /**
   * Get payment method display name
   */
  const formatPaymentMethod = useCallback((method: string): string => {
    const methodNames: Record<string, string> = {
      'credit_card': 'Credit Card',
      'debit_card': 'Debit Card',
      'paypal': 'PayPal',
      'bank_transfer': 'Bank Transfer',
      'cash': 'Cash',
      'check': 'Check'
    };
    return methodNames[method] || method;
  }, []);

  /**
   * Get payment status color
   */
  const getStatusColor = useCallback((status: string): string => {
    const colors: Record<string, string> = {
      'pending': 'text-yellow-600',
      'processing': 'text-blue-600',
      'completed': 'text-green-600',
      'failed': 'text-red-600',
      'refunded': 'text-purple-600',
      'cancelled': 'text-gray-600'
    };
    return colors[status] || 'text-gray-600';
  }, []);

  return {
    // State
    loading: state.loading,
    error: state.error,
    success: state.success,
    paymentId: state.paymentId,
    clientSecret: state.clientSecret,
    feeCalculation,
    paymentHistory,
    paymentSummary,

    // Actions
    calculateFee,
    createPayment,
    confirmPayment,
    failPayment,
    processRefund,
    loadPaymentHistory,
    loadPaymentSummary,
    checkPaymentStatus,
    generateReceipt,
    testPaymentService,
    clearState,

    // Utilities
    formatCurrency,
    formatPaymentMethod,
    getStatusColor,
  };
}

/**
 * Hook for payment automation and integration with entries
 */
export function usePaymentAutomation() {
  const { createPayment, confirmPayment } = usePaymentProcessing();

  /**
   * Automatically create payment for entry
   */
  const createEntryPayment = useCallback(async (
    entry: Record<string, unknown>,
    userId: string,
    feeAmount: number
  ): Promise<boolean> => {
    if (!entry || !userId || feeAmount <= 0) {
      console.error('Invalid payment parameters');
      return false;
    }

    const description = `Entry fee for ${entry.dogName || 'dog'} in ${entry.className || 'class'} - ${entry.showName || 'show'}`;

    return await createPayment(
      entry.id as string,
      userId,
      feeAmount,
      description,
      'usd',
      {
        entryId: entry.id,
        dogName: entry.dogName,
        className: entry.className,
        showName: entry.showName,
        showId: entry.showId
      }
    );
  }, [createPayment]);

  /**
   * Handle payment success callback
   */
  const handlePaymentSuccess = useCallback(async (
    paymentId: string,
    transactionId: string,
    paymentMethodInfo: PaymentMethodInfo
  ): Promise<boolean> => {
    const success = await confirmPayment(paymentId, transactionId, paymentMethodInfo);
    
    if (success) {
      // Could trigger additional actions like:
      // - Send confirmation email
      // - Update entry status
      // - Log payment event
      console.log('🎉 Payment successfully processed and confirmed');
    }

    return success;
  }, [confirmPayment]);

  return {
    createEntryPayment,
    handlePaymentSuccess,
  };
}