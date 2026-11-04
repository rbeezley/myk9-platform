import { describeWithdrawalPolicy } from '@/features/payments/formatWithdrawalPolicy';
import type { ShowWithdrawalPolicySummary } from '@/hooks/queries/useShowWithdrawalPolicySummary';

/**
 * The About tab's policy text, from the SAME formatter exhibitors see before they pay
 * (`describeWithdrawalPolicy`), so About never states a retention the notes or a blank cutoff
 * contradict. An empty list means the show sets nothing and inherits the club default.
 */
export function summarizeWithdrawalPolicy(policy: ShowWithdrawalPolicySummary): string[] {
  const hasRetention = policy.retentionType !== null && policy.retentionValue !== null;
  if (!policy.cutoffDate && !hasRetention && !policy.notes?.trim()) return [];
  const { refundLine, notes } = describeWithdrawalPolicy({
    cutoffDate: policy.cutoffDate,
    retentionType: policy.retentionType ?? 'flat',
    retentionValue: policy.retentionValue,
    // A stored type + value is a declared retention, an explicit 0 included.
    retentionDeclared: hasRetention,
    notes: policy.notes,
  });
  return notes ? [refundLine, notes] : [refundLine];
}
