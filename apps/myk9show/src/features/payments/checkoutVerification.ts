import { type CheckoutVerificationResult, verifyCheckoutSession } from '@/lib/stripe';

export const CHECKOUT_VERIFICATION_TIMEOUT_MS = 8000;
export const CHECKOUT_VERIFICATION_DEADLINE_MS = 30000;
const MAX_VERIFICATION_ATTEMPTS = 11;
const VERIFICATION_POLL_INTERVAL_MS = 2000;
const MAX_UNAVAILABLE_ATTEMPTS = 2;

const unavailableResult = (): CheckoutVerificationResult => ({
  success: false,
  verificationStatus: 'unavailable',
  error: 'We could not check your payment status right now.',
});

export async function checkCheckoutSession(
  sessionId: string,
  timeoutMs = CHECKOUT_VERIFICATION_TIMEOUT_MS
): Promise<CheckoutVerificationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<CheckoutVerificationResult>(resolve => {
      timeoutId = setTimeout(() => resolve(unavailableResult()), timeoutMs);
    });

    return await Promise.race([verifyCheckoutSession(sessionId), timeout]);
  } catch {
    return unavailableResult();
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise(resolve => {
    const timeoutId = setTimeout(finish, delayMs);
    signal.addEventListener('abort', finish, { once: true });

    function finish() {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', finish);
      resolve();
    }
  });
}

export async function pollCheckoutSession(
  sessionId: string,
  signal: AbortSignal
): Promise<CheckoutVerificationResult | null> {
  let unavailableAttempts = 0;
  const deadlineAt = Date.now() + CHECKOUT_VERIFICATION_DEADLINE_MS;

  for (let attempt = 1; attempt <= MAX_VERIFICATION_ATTEMPTS; attempt += 1) {
    if (signal.aborted) return null;

    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) return unavailableResult();

    const result = await checkCheckoutSession(
      sessionId,
      Math.min(CHECKOUT_VERIFICATION_TIMEOUT_MS, remainingMs)
    );
    if (signal.aborted) return null;
    if (result.success) return result;
    if (Date.now() >= deadlineAt) return unavailableResult();

    const retryUnavailable =
      result.verificationStatus === 'unavailable' &&
      ++unavailableAttempts < MAX_UNAVAILABLE_ATTEMPTS;
    const retryProcessing = result.verificationStatus === 'processing';
    if ((!retryUnavailable && !retryProcessing) || attempt === MAX_VERIFICATION_ATTEMPTS) {
      return result;
    }

    await abortableDelay(Math.min(VERIFICATION_POLL_INTERVAL_MS, deadlineAt - Date.now()), signal);
  }

  return null;
}
