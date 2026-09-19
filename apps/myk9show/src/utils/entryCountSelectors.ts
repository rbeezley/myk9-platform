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
import { buildMoneyAttribution } from '@/features/financial/moneyRoot';

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
  allEntries: readonly EntryManagementEntry[]
): EntryManagementCountSummary {
  const counts = { pending: 0, accepted: 0, waitlist: 0, issues: 0, revenue: 0, outstanding: 0 };

  // MYK9-639: one row per RUN. The superseded half of a move-up is counted
  // nowhere — not in `total`, not in a tab, not in revenue — because the dog
  // enters the ring once; and the surviving row's money is read from its root,
  // because a move-up destination is created money-neutral. Counting the pair
  // made Entry Management read "2 entries" for one paid run, and reading the
  // destination's own $0 would have made the revenue vanish instead.
  const attribution = buildMoneyAttribution(allEntries);
  const entries = attribution.live;

  for (const entry of entries) {
    const moneyRoot = attribution.rootById.get(entry.id) ?? entry;
    if (isPendingEntry(entry)) counts.pending++;
    if (isAcceptedEntry(entry)) counts.accepted++;
    if (isWaitlistEntry(entry)) counts.waitlist++;
    if (
      isIssueEntry({
        entryStatus: entry.entryStatus,
        // The RUN's status, but the ROOT's payment: a move-up destination reads
        // `pending` by construction and is not an unpaid entry.
        paymentStatus: getEffectivePaymentStatus(moneyRoot),
      })
    ) {
      counts.issues++;
    }
    counts.revenue += moneyRoot.paidAmount;

    // Match the Financial Report's inclusion rule: waitlisted/withdrawn/
    // scratched/not_accepted entries are never counted as money owed, even
    // if their payment status happens to still read "pending".
    if (isEntryIncludedInFinancialReport(entry, 'current')) {
      const effectivePaymentStatus = getEffectivePaymentStatus(moneyRoot);
      counts.outstanding += computeOutstandingAmount(moneyRoot.totalFee, {
        isWaived: Boolean(moneyRoot.comped) || effectivePaymentStatus === PaymentStatus.WAIVED,
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
