export const LATE_ENTRY_PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'check', label: 'Check' },
  { id: 'waived', label: 'Waived' },
  { id: 'paid', label: 'Paid' },
  { id: 'unknown', label: 'Unspecified' },
] as const;

export type ReconciliationPaymentMethod = (typeof LATE_ENTRY_PAYMENT_METHODS)[number]['id'];

export interface ShowDayReconciliationEntry {
  id?: string | null;
  is_day_of_show?: boolean | null;
  entry_fee?: number | string | null;
  entry_status?: string | null;
  check_in_status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
}

export interface ShowDayReconciliationSummary {
  lateEntryCount: number;
  collectedAmount: number;
  waivedCount: number;
  pulledCount: number;
  refundReviewCount: number;
  refundReviewAmount: number;
  refundedCount: number;
  refundedAmount: number;
  byMethod: Record<ReconciliationPaymentMethod, { count: number; amount: number }>;
}

function emptyBreakdown(): ShowDayReconciliationSummary['byMethod'] {
  return LATE_ENTRY_PAYMENT_METHODS.reduce(
    (acc, method) => {
      acc[method.id] = { count: 0, amount: 0 };
      return acc;
    },
    {} as ShowDayReconciliationSummary['byMethod']
  );
}

function amount(value: ShowDayReconciliationEntry['entry_fee']): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

function normalizeMethod(entry: ShowDayReconciliationEntry): ReconciliationPaymentMethod {
  const method = entry.payment_method?.toLowerCase();
  if (method === 'cash' || method === 'check' || method === 'waived') return method;
  if (entry.payment_status === 'waived') return 'waived';
  if (entry.payment_status === 'paid') return 'paid';
  return 'unknown';
}

function isPulledEntry(entry: ShowDayReconciliationEntry): boolean {
  const entryStatus = entry.entry_status?.toLowerCase();
  const checkInStatus = entry.check_in_status?.toLowerCase();

  return (
    checkInStatus === 'pulled' ||
    entryStatus === 'scratched' ||
    entryStatus === 'withdrawn' ||
    entryStatus === 'absent'
  );
}

export function summarizeShowDayReconciliation(
  entries: ShowDayReconciliationEntry[]
): ShowDayReconciliationSummary {
  const summary: ShowDayReconciliationSummary = {
    lateEntryCount: 0,
    collectedAmount: 0,
    waivedCount: 0,
    pulledCount: 0,
    refundReviewCount: 0,
    refundReviewAmount: 0,
    refundedCount: 0,
    refundedAmount: 0,
    byMethod: emptyBreakdown(),
  };

  for (const entry of entries) {
    const fee = amount(entry.entry_fee);
    const paymentStatus = entry.payment_status?.toLowerCase();

    if (isPulledEntry(entry)) {
      summary.pulledCount += 1;

      if (paymentStatus === 'refunded') {
        summary.refundedCount += 1;
        summary.refundedAmount += fee;
      } else if (paymentStatus === 'paid') {
        summary.refundReviewCount += 1;
        summary.refundReviewAmount += fee;
      }
    }

    // is_day_of_show was historically present but not populated by the
    // late-entry dialog; only explicitly flagged rows belong in Wrap-up totals.
    if (entry.is_day_of_show !== true) continue;

    const method = normalizeMethod(entry);
    summary.lateEntryCount += 1;
    summary.byMethod[method].count += 1;
    summary.byMethod[method].amount += fee;

    if (method === 'waived') {
      summary.waivedCount += 1;
    } else if (paymentStatus === 'paid') {
      summary.collectedAmount += fee;
    }
  }

  return summary;
}
