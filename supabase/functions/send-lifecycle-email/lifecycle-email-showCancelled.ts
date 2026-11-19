/**
 * The "show cancelled" email (MYK9-2127): rendered when it is SENT. The money line is fixed by
 * the owner (2026-11-19): it promises no refund, starts none and names no amount or date.
 */

export const SHOW_CANCELLED_MONEY_LINE = 'The club will contact you about your entry fees.';

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Cancelled and still on the books: the one state this email may be sent for. */
export function isCancelledShow(show: {
  status: string | null;
  deleted_at?: string | null;
}): boolean {
  return !show.deleted_at && (show.status ?? '').toLowerCase() === 'cancelled';
}

export function renderShowCancelledEmail(args: {
  showId: string;
  showName: string | null;
  recipientName: string | null;
}): { subject: string; body: string } {
  const showName = clean(args.showName) || 'Your show';
  const firstName = clean(args.recipientName).split(/\s+/)[0] || 'there';
  const body = [
    `Hi ${firstName},`,
    `${showName} has been cancelled.`,
    SHOW_CANCELLED_MONEY_LINE,
    `Your entries: https://myk9show.com/exhibitor/entries?showId=${args.showId}`,
    'Please contact the show secretary with questions.',
  ].join('\n\n');
  return { subject: `${showName} has been cancelled`, body };
}
