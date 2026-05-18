export type LateEntryPaymentMethod = 'cash' | 'check' | 'waived' | 'paid' | 'unknown';

export interface LateEntryReconciliationEntry {
  id?: string | null;
  is_day_of_show?: boolean | null;
  entry_fee?: number | string | null;
  payment_status?: string | null;
  payment_method?: string | null;
}

export interface LateEntryReconciliationSummary {
  entryCount: number;
  collectedAmount: number;
  waivedCount: number;
  waivedAmount: number;
  byMethod: Record<LateEntryPaymentMethod, { count: number; amount: number }>;
}

const PAYMENT_METHODS: LateEntryPaymentMethod[] = ['cash', 'check', 'waived', 'paid', 'unknown'];

function emptyBreakdown(): LateEntryReconciliationSummary['byMethod'] {
  return PAYMENT_METHODS.reduce(
    (acc, method) => {
      acc[method] = { count: 0, amount: 0 };
      return acc;
    },
    {} as LateEntryReconciliationSummary['byMethod']
  );
}

function amount(value: LateEntryReconciliationEntry['entry_fee']): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

function normalizeMethod(entry: LateEntryReconciliationEntry): LateEntryPaymentMethod {
  const method = entry.payment_method?.toLowerCase();
  if (method === 'cash' || method === 'check' || method === 'waived') return method;
  if (entry.payment_status === 'waived') return 'waived';
  if (entry.payment_status === 'paid') return 'paid';
  return 'unknown';
}

export function summarizeLateEntryReconciliation(
  entries: LateEntryReconciliationEntry[]
): LateEntryReconciliationSummary {
  const summary: LateEntryReconciliationSummary = {
    entryCount: 0,
    collectedAmount: 0,
    waivedCount: 0,
    waivedAmount: 0,
    byMethod: emptyBreakdown(),
  };

  for (const entry of entries) {
    if (entry.is_day_of_show !== true) continue;

    const fee = amount(entry.entry_fee);
    const method = normalizeMethod(entry);
    summary.entryCount += 1;
    summary.byMethod[method].count += 1;
    summary.byMethod[method].amount += fee;

    if (method === 'waived') {
      summary.waivedCount += 1;
      summary.waivedAmount += fee;
    } else if (entry.payment_status === 'paid' || method === 'cash' || method === 'check') {
      summary.collectedAmount += fee;
    }
  }

  return summary;
}
