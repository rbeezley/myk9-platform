/**
 * Exhibitor-facing withdrawal-policy disclosure, shown BEFORE payment at every
 * pay surface (cart self-pay, secretary payment link). Self-contained: give it
 * a showId and it resolves + renders the effective policy.
 *
 * Renders nothing while loading or on error (e.g. before the policy migration
 * is deployed) — graceful absence, never a crash or a flash of placeholder.
 *
 * See docs/plan-refund-policy-withdrawal.md (Phase 3).
 */

import { cn } from '@/lib/utils';
import { useEffectiveWithdrawalPolicy } from './useEffectiveWithdrawalPolicy';
import { describeWithdrawalPolicy } from './formatWithdrawalPolicy';

interface WithdrawalPolicyDisclosureProps {
  showId: string | null | undefined;
  className?: string;
}

export function WithdrawalPolicyDisclosure({
  showId,
  className,
}: WithdrawalPolicyDisclosureProps) {
  const { data: policy, isLoading, isError } = useEffectiveWithdrawalPolicy(showId);

  if (!showId || isLoading || isError) return null;

  const { refundLine, notes } = describeWithdrawalPolicy(policy ?? null);

  return (
    <div className={cn('text-xs text-muted-foreground', className)}>
      <p>{refundLine}</p>
      {notes && <p className="mt-1 italic">{notes}</p>}
    </div>
  );
}
