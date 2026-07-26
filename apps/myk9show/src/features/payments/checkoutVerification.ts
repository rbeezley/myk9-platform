import { type CheckoutVerificationResult, verifyCheckoutSession } from '@/lib/stripe';

export const CHECKOUT_VERIFICATION_TIMEOUT_MS = 8000;

const unavailableResult = (): CheckoutVerificationResult => ({
  success: false,
  verificationStatus: 'unavailable',
  error: 'We could not check your payment status right now.',
});

export async function checkCheckoutSession(sessionId: string): Promise<CheckoutVerificationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<CheckoutVerificationResult>(resolve => {
      timeoutId = setTimeout(() => resolve(unavailableResult()), CHECKOUT_VERIFICATION_TIMEOUT_MS);
    });

    return await Promise.race([verifyCheckoutSession(sessionId), timeout]);
  } catch {
    return unavailableResult();
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
