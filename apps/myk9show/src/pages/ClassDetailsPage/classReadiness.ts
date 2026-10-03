import { countEntryAccounting } from '@/features/_shared/entryAccounting';
import {
  buildClassEntryBreakdowns,
  type ClassEntryBreakdown,
} from '@/features/entry-operations/classEntryBreakdown';
import {
  classifyRawEntryAttention,
  getOperationalEntryState,
  type RawOperationalEntryInput,
} from '@/features/entry-operations/attentionClassification';

export interface ClassReadinessEntry extends RawOperationalEntryInput {
  registration_id?: string | null;
  check_in_status?: string | null;
  is_scored?: boolean | null;
  result_status?: string | null;
}

export interface ClassReadinessClassInput {
  status: string;
  is_scoring_finalized?: boolean | null | undefined;
  isScoringFinalized?: boolean | null | undefined;
  reopened_after_closeout_at?: string | null | undefined;
  reopenedAfterCloseoutAt?: string | null | undefined;
}

export interface ClassReadinessSummary {
  /** Entered / pending, the same pair the Overview schedule card shows. */
  entryBreakdown: ClassEntryBreakdown;
  /** Entries the class still expects to run: the denominator of `scoredCount`. */
  expectedEntries: number;
  pendingReviewCount: number;
  missingInformationCount: number;
  paymentDueCount: number;
  paymentStatusUnavailable: boolean;
  checkedInCount: number;
  checkInEligibleCount: number;
  scoredCount: number;
  classStatus: string;
  isScoringFinalized: boolean;
  reopenedAfterCloseoutAt: string | null;
}

export function buildClassReadinessSummary(
  classData: ClassReadinessClassInput,
  entries: ReadonlyArray<ClassReadinessEntry>,
  scopeEntries: ReadonlyArray<ClassReadinessEntry> = entries
): ClassReadinessSummary {
  const attentionReasons = entries.map(entry =>
    entry.check_in_status === 'pulled' ? [] : classifyRawEntryAttention(entry, scopeEntries)
  );
  const checkInEligibleEntries = entries.filter(
    entry => getOperationalEntryState({ rawEntryStatus: entry.entry_status }) === 'accepted'
  );
  const paymentStatusUnavailable = entries.some(
    entry => entry.registration_id != null && entry.registration == null
  );

  // One bucket key: the breakdown helper groups by class, and `entries` is one class.
  const entryBreakdown = buildClassEntryBreakdowns(
    entries.map(entry => ({ class_id: 'class', entry_status: entry.entry_status }))
  ).get('class') ?? { entered: 0, pending: 0 };
  const accounting = countEntryAccounting(
    entries.map(entry => ({
      entryStatus: entry.entry_status ?? undefined,
      checkInStatus: entry.check_in_status ?? undefined,
      isScored: entry.is_scored ?? undefined,
      resultStatus: entry.result_status ?? undefined,
    }))
  );

  return {
    entryBreakdown,
    expectedEntries: accounting.expected,
    pendingReviewCount: attentionReasons.filter(reasons => reasons.includes('pending_review'))
      .length,
    missingInformationCount: attentionReasons.filter(reasons =>
      reasons.includes('missing_information')
    ).length,
    paymentDueCount: paymentStatusUnavailable
      ? 0
      : attentionReasons.filter(reasons => reasons.includes('payment_due')).length,
    paymentStatusUnavailable,
    checkedInCount: checkInEligibleEntries.filter(entry => entry.check_in_status === 'checked-in')
      .length,
    checkInEligibleCount: checkInEligibleEntries.length,
    scoredCount: accounting.accounted,
    classStatus: classData.status,
    isScoringFinalized: classData.is_scoring_finalized ?? classData.isScoringFinalized ?? false,
    reopenedAfterCloseoutAt:
      classData.reopened_after_closeout_at ?? classData.reopenedAfterCloseoutAt ?? null,
  };
}
