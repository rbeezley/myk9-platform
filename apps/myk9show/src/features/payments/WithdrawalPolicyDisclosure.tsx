/**
 * Exhibitor-facing refund and withdrawal policy: the club's own text (MYK9-1976), or the
 * default when the club wrote none, then the service-fee sentence, which sits outside what the
 * club edits so no text can remove it. Shown BEFORE payment at every pay surface (cart
 * self-pay, secretary payment link) and in the Pull or withdraw and refund dialogs.
 * Self-contained: give it a showId and it resolves and renders the effective text.
 *
 * Plain text with its line breaks kept; rendered as text, so markup a club types is shown,
 * never run.
 *
 * The text is an online-only read. Without `unavailable`, nothing renders until it has
 * loaded (graceful absence, never a flash of a placeholder policy). A surface that must never
 * go silent (the Pull or withdraw chooser) passes `unavailable`, and gets a short line when the
 * read is paused offline or failed.
 *
 * See docs/plan-refund-policy-withdrawal.md (Phase 3).
 */

import { cn } from '@/lib/utils';
import { useEffectiveWithdrawalPolicy } from './useEffectiveWithdrawalPolicy';
import { SERVICE_FEE_SENTENCE } from './withdrawalPolicyText';

interface WithdrawalPolicyDisclosureProps {
  showId: string | null | undefined;
  className?: string;
  /** Optional heading, for surfaces where the policy sits among other content. */
  heading?: string;
  /** Lines to show when the text cannot be loaded, offline or after an error. */
  unavailable?: { offline: string; failed: string };
}

export function WithdrawalPolicyDisclosure({
  showId,
  className,
  heading,
  unavailable,
}: WithdrawalPolicyDisclosureProps) {
  const { data, isError, fetchStatus } = useEffectiveWithdrawalPolicy(showId);

  if (!showId) return null;

  if (!data) {
    const offline = fetchStatus === 'paused';
    if (!unavailable || (!offline && !isError)) return null;
    return (
      <p
        className={cn('text-xs text-muted-foreground', className)}
        data-testid="withdrawal-policy-unavailable"
      >
        {offline ? unavailable.offline : unavailable.failed}
      </p>
    );
  }

  return (
    <div
      className={cn('text-xs text-muted-foreground', className)}
      data-testid="withdrawal-policy-disclosure"
    >
      {heading && <p className="mb-1 font-medium text-foreground">{heading}</p>}
      <p className="whitespace-pre-line" data-testid="withdrawal-policy-text">
        {data.text}
      </p>
      <p className="mt-2" data-testid="withdrawal-policy-service-fee">
        {SERVICE_FEE_SENTENCE}
      </p>
    </div>
  );
}
