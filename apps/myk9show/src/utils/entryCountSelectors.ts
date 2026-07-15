import { PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry, EntryStats } from '@/types/entry-management-types';
import { getEffectivePaymentStatus } from '@/utils/entryManagementUtils';
import {
  isAcceptedEntry,
  isIssueEntry,
  isPendingEntry,
  isWaitlistEntry,
} from '@/utils/entryPredicates';
import { classifyRawEntryAttention } from '@/features/entry-operations/attentionClassification';
import {
  computeOutstandingAmount,
  isEntryIncludedInFinancialReport,
} from '@/components/reports/financialReportTotals';

export interface EntryManagementBucketCounts {
  all: number;
  pending: number;
  accepted: number;
  waitlist: number;
  issues: number;
}

export interface EntryManagementCountSummary {
  stats: EntryStats;
  tabCounts: EntryManagementBucketCounts;
}

export interface RawEntryStatusLike {
  entry_status?: string | null;
}

export function isRawEntryInEntryManagementPendingBucket(entry: RawEntryStatusLike): boolean {
  return classifyRawEntryAttention(entry).includes('pending_review');
}

export function countRawEntryManagementPendingBucket(
  entries: readonly RawEntryStatusLike[]
): number {
  return entries.filter(isRawEntryInEntryManagementPendingBucket).length;
}

export function getEntryManagementCountSummary(
  entries: readonly EntryManagementEntry[]
): EntryManagementCountSummary {
  const counts = { pending: 0, accepted: 0, waitlist: 0, issues: 0, revenue: 0, outstanding: 0 };

  for (const entry of entries) {
    if (isPendingEntry(entry)) counts.pending++;
    if (isAcceptedEntry(entry)) counts.accepted++;
    if (isWaitlistEntry(entry)) counts.waitlist++;
    if (
      isIssueEntry({
        entryStatus: entry.entryStatus,
        paymentStatus: getEffectivePaymentStatus(entry),
      })
    ) {
      counts.issues++;
    }
    counts.revenue += entry.paidAmount;

    // Match the Financial Report's inclusion rule: waitlisted/withdrawn/
    // scratched/not_accepted entries are never counted as money owed, even
    // if their payment status happens to still read "pending".
    if (isEntryIncludedInFinancialReport(entry, 'current')) {
      const effectivePaymentStatus = getEffectivePaymentStatus(entry);
      counts.outstanding += computeOutstandingAmount(entry.totalFee, {
        isWaived: Boolean(entry.comped) || effectivePaymentStatus === PaymentStatus.WAIVED,
        isPending: effectivePaymentStatus === PaymentStatus.PENDING,
      });
    }
  }

  return {
    stats: {
      total: entries.length,
      pending: counts.pending,
      accepted: counts.accepted,
      waitlist: counts.waitlist,
      revenue: counts.revenue,
      outstanding: counts.outstanding,
    },
    tabCounts: {
      all: entries.length,
      pending: counts.pending,
      accepted: counts.accepted,
      waitlist: counts.waitlist,
      issues: counts.issues,
    },
  };
}
