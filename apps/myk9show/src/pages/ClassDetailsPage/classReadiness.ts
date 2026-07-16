import {
  classifyRawEntryAttention,
  getOperationalEntryState,
  type RawOperationalEntryInput,
} from '@/features/entry-operations/attentionClassification';

export interface ClassReadinessEntry extends RawOperationalEntryInput {
  registration_id?: string | null;
  check_in_status?: string | null;
  is_scored?: boolean | null;
}

export interface ClassReadinessClassInput {
  status: string;
  is_scoring_finalized?: boolean | null | undefined;
  isScoringFinalized?: boolean | null | undefined;
  reopened_after_closeout_at?: string | null | undefined;
  reopenedAfterCloseoutAt?: string | null | undefined;
}

export interface ClassReadinessSummary {
  totalEntries: number;
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
  entries: ReadonlyArray<ClassReadinessEntry>
): ClassReadinessSummary {
  const attentionReasons = entries.map(entry =>
    entry.check_in_status === 'pulled' ? [] : classifyRawEntryAttention(entry)
  );
  const checkInEligibleEntries = entries.filter(
    entry => getOperationalEntryState({ rawEntryStatus: entry.entry_status }) === 'accepted'
  );
  const paymentStatusUnavailable = entries.some(
    entry => entry.registration_id != null && entry.registration == null
  );

  return {
    totalEntries: entries.length,
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
    scoredCount: entries.filter(entry => entry.is_scored === true).length,
    classStatus: classData.status,
    isScoringFinalized: classData.is_scoring_finalized ?? classData.isScoringFinalized ?? false,
    reopenedAfterCloseoutAt:
      classData.reopened_after_closeout_at ?? classData.reopenedAfterCloseoutAt ?? null,
  };
}
