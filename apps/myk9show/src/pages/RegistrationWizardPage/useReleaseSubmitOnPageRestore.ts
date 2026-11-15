/**
 * MYK9-1964: card Pay keeps the submit latch held while Stripe's page loads,
 * so a second press cannot refill the cart that page is about to charge. Back
 * from Stripe can restore this page from the browser's back-forward cache with
 * that latch still held, and the Pay button would stay busy for good. A
 * restored page (`pageshow` with `persisted`) has left Stripe behind, so the
 * latch and the spinner are released and she can press Pay again.
 */
import { useEffect, type MutableRefObject } from 'react';

export function useReleaseSubmitOnPageRestore(
  submittingRef: MutableRefObject<boolean>,
  setIsSubmitting: (value: boolean) => void
): void {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      submittingRef.current = false;
      setIsSubmitting(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [submittingRef, setIsSubmitting]);
}
