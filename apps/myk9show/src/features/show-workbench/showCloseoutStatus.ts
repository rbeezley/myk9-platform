import type { ChipColor } from '@/components/base/Chip';

export interface CloseoutStatus {
  label: string;
  color: ChipColor;
}

export type IncidentState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; reportableCount: number };

export interface CloseoutStatusInput {
  reconNeedsReview: boolean;
  pulledCount: number;
  refundReviewCount: number;
  hasEntries: boolean;
  incidents: IncidentState;
}

// Roll both closeout halves into one header chip: amber whenever something is
// unresolved (paid pulls / refund review on the reconciliation side, reportable
// incidents, or an incident load failure we can't confirm past), stone when both
// halves are clean. Pure so the chip wording is unit-tested without a DOM.
export function summarizeCloseoutStatus(input: CloseoutStatusInput): CloseoutStatus {
  const segments: string[] = [];
  if (input.reconNeedsReview) {
    segments.push(`${input.pulledCount} pulled · ${input.refundReviewCount} review`);
  }
  if (input.incidents.state === 'ready' && input.incidents.reportableCount > 0) {
    segments.push(`${input.incidents.reportableCount} reportable`);
  }
  if (segments.length > 0) {
    return { label: segments.join(' · '), color: 'amber' };
  }
  if (input.incidents.state === 'error') {
    return { label: 'Check incidents', color: 'amber' };
  }
  if (input.incidents.state === 'loading') {
    return { label: 'Checking incidents', color: 'stone' };
  }
  if (!input.hasEntries) {
    return { label: 'Nothing to reconcile', color: 'stone' };
  }
  return { label: 'Ready to close', color: 'stone' };
}
