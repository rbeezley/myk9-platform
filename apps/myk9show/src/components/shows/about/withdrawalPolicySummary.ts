import { formatFee } from '@/utils/format';
import { formatDateRange } from '@/utils/date-format';
import type { ShowWithdrawalPolicySummary } from '@/hooks/queries/useShowWithdrawalPolicySummary';

/**
 * Plain sentences for the About tab, in the card's own terms: a full-refund cutoff date, what is
 * kept after it, and free-text notes. An empty list means the show inherits the club default.
 */
export function summarizeWithdrawalPolicy(policy: ShowWithdrawalPolicySummary): string[] {
  const lines: string[] = [];
  if (policy.cutoffDate) {
    lines.push(`Full refund through ${formatDateRange(policy.cutoffDate, policy.cutoffDate)}.`);
  }
  if (policy.retentionType && policy.retentionValue !== null) {
    const kept =
      policy.retentionType === 'flat'
        ? formatFee(policy.retentionValue / 100)
        : `${policy.retentionValue}%`;
    lines.push(
      policy.cutoffDate
        ? `After that, ${kept} is kept.`
        : `${kept} is kept when an exhibitor withdraws.`
    );
  }
  if (policy.notes?.trim()) lines.push(policy.notes.trim());
  return lines;
}
