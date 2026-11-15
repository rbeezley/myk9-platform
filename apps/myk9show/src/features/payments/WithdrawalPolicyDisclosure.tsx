/**
 * Exhibitor-facing refund and withdrawal policy: the club's own text (MYK9-1976), or the
 * default when the club wrote none. Shown BEFORE payment at every pay surface (cart self-pay,
 * secretary payment link) and in the Pull or withdraw dialogs. Self-contained: give it a
 * showId and it resolves and renders the effective text.
 *
 * Plain text with its line breaks kept; rendered as text, so markup a club types is shown,
 * never run.
 *
 * Renders nothing until the text has loaded (loading, offline, or an error): graceful
 * absence, never a crash or a flash of a placeholder policy.
 *
 * See docs/plan-refund-policy-withdrawal.md (Phase 3).
 */

import { cn } from '@/lib/utils';
import { useEffectiveWithdrawalPolicy } from './useEffectiveWithdrawalPolicy';

interface WithdrawalPolicyDisclosureProps {
  showId: string | null | undefined;
  className?: string;
  /** Optional heading, for surfaces where the policy sits among other content. */
  heading?: string;
}

export function WithdrawalPolicyDisclosure({
  showId,
  className,
  heading,
}: WithdrawalPolicyDisclosureProps) {
  const { data } = useEffectiveWithdrawalPolicy(showId);

  if (!showId || !data) return null;

  return (
    <div
      className={cn('text-xs text-muted-foreground', className)}
      data-testid="withdrawal-policy-text"
    >
      {heading && <p className="mb-1 font-medium text-foreground">{heading}</p>}
      <p className="whitespace-pre-line">{data.text}</p>
    </div>
  );
}
