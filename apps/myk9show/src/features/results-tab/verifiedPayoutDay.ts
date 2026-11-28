import { showCalendarDay } from '@/features/payments/payoutDeadline';

/**
 * The show's last day for a payout date, or null while it cannot be trusted: a cached placeholder
 * (`isFromCache`) or a failed refresh may carry a rescheduled show's old end date, so the line
 * then states the promise in words (MYK9-2427).
 */
export function verifiedPayoutDay(details: {
  show: { endDate?: string | null | undefined } | null;
  isFromCache: boolean;
  refreshFailed: boolean;
}): string | null {
  if (details.isFromCache || details.refreshFailed) return null;
  return showCalendarDay(details.show?.endDate);
}
