export type PullTiming = 'before_close' | 'after_close' | null;
export type PullRefundDecision = 'denied';
export type PullRefundChoice = 'refund' | PullRefundDecision;

const DEFAULT_TIMEZONE = 'America/New_York';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function localCalendarDate(instant: Date, timeZone: string): string {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  };

  try {
    return format(timeZone);
  } catch {
    return format(DEFAULT_TIMEZONE);
  }
}

export function derivePullTiming({
  pulledAt,
  entryCloseDate,
  timeZone,
}: {
  pulledAt: string | null | undefined;
  entryCloseDate: string | null | undefined;
  timeZone: string | null | undefined;
}): PullTiming {
  if (!pulledAt || !entryCloseDate) return null;
  const closeDay = entryCloseDate.slice(0, 10);
  if (!ISO_DATE.test(closeDay)) return null;

  const pulledInstant = new Date(pulledAt);
  if (Number.isNaN(pulledInstant.getTime())) return null;

  const pulledDay = localCalendarDate(pulledInstant, timeZone || DEFAULT_TIMEZONE);
  return pulledDay <= closeDay ? 'before_close' : 'after_close';
}

export function getSuggestedPullRefundDecision(timing: PullTiming): PullRefundChoice | null {
  if (timing === 'before_close') return 'refund';
  if (timing === 'after_close') return 'denied';
  return null;
}

export interface PullRefundDecisionEntry {
  entry_status: string | null;
  payment_method: string | null;
  payment_status: string | null;
  refund_amount: number | null;
  refund_decision: string | null;
}

export function isUnresolvedPullRefundDecision(entry: PullRefundDecisionEntry): boolean {
  return (
    entry.entry_status === 'scratched' &&
    entry.payment_method === 'online' &&
    entry.payment_status === 'paid' &&
    (entry.refund_amount ?? 0) <= 0 &&
    entry.refund_decision === null
  );
}
