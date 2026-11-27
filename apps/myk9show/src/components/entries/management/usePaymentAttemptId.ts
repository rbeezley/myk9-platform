import { useCallback, useRef } from 'react';
import type {
  EnrollmentLedgerAction,
  LedgerPaymentDetails,
} from '@/features/payments/showPaymentLedger';

/**
 * MYK9-1936: every payment the secretary submits carries its own id, and the
 * server records one id once. One dialog's attempt keeps its id while she
 * retries the SAME payment after a save that failed or could not be confirmed
 * (MYK9-2156 keeps what she typed), so a retry after a lost answer is not
 * recorded twice. A changed amount or method is a different payment and gets a
 * new id; so does the next payment once a save is confirmed (`clear`) or a
 * dialog opens fresh.
 */
export function usePaymentAttemptId() {
  const attempt = useRef<{ key: string; id: string } | null>(null);

  const withId = useCallback(
    (
      enrollmentId: string,
      payment: LedgerPaymentDetails
    ): Extract<EnrollmentLedgerAction, { kind: 'payment' }> => {
      // The server refuses one id reused for another enrollment, method or amount.
      const key = `${enrollmentId}|${payment.method}|${payment.amount}`;
      if (attempt.current?.key !== key) {
        attempt.current = { key, id: crypto.randomUUID() };
      }
      return { ...payment, clientPaymentId: attempt.current.id };
    },
    []
  );

  const clear = useCallback(() => {
    attempt.current = null;
  }, []);

  return { withId, clear };
}
