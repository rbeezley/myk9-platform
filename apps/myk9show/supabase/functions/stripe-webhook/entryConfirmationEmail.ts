export interface StripeEntryConfirmationEmailData {
  exhibitorName: string;
  showName: string;
  showDate: string;
  showLocation?: string;
  entries: Array<{
    dogName: string;
    className: string;
    classLevel?: string;
    entryFee: number;
  }>;
  subtotal: number;
  serviceFee: number;
  /** Cents charged to the card: the same figure the success page shows as Order Total. */
  total: number;
  /** Cents charged for entries the show could not accept; their refund is under review. */
  refundPendingCents?: number;
  /** The order's confirmation number, as the success page shows it. Omitted when none exists. */
  confirmationNumber?: string | null;
  /** Where her entries are listed, for example https://myk9show.com/exhibitor/entries. */
  entriesUrl: string;
}

/** Armbands are given out closer to the show, so the email says where the number will appear. */
const ARMBAND_NOTE =
  'Your armband number is assigned closer to the show. It will appear next to each dog in My Shows.';

export function renderStripeEntryConfirmationEmail(data: StripeEntryConfirmationEmailData): string {
  const entryRows = data.entries
    .map(
      entry => `<tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb">
          <strong>${escapeHtml(entry.dogName)}</strong><br>
          <span style="color:#6b7280;font-size:14px">${escapeHtml(entry.className)}${entry.classLevel ? `, ${escapeHtml(entry.classLevel)}` : ''}</span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right">${formatCurrency(entry.entryFee)}</td>
      </tr>`
    )
    .join('');

  const confirmationBlock = data.confirmationNumber
    ? `<div style="background:#ecfdf5;border-radius:6px;padding:16px;text-align:center;margin-bottom:20px">
          <p style="margin:0;color:#6b7280;font-size:14px">Confirmation number</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:600;color:#059669;font-family:monospace">${escapeHtml(data.confirmationNumber)}</p>
        </div>`
    : '';
  const refundPendingRow =
    data.refundPendingCents && data.refundPendingCents > 0
      ? `<p style="margin:4px 0">Entries the show could not accept: <strong>${formatCurrency(data.refundPendingCents)}</strong> (refund under review)</p>`
      : '';

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937">
    <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden">
      <div style="background:#2563eb;padding:24px;text-align:center">
        <h1 style="margin:0;color:#fff;font-size:24px">Entry confirmed</h1>
      </div>
      <div style="padding:28px 24px">
        ${confirmationBlock}
        <p>Hi ${escapeHtml(data.exhibitorName)}, your paid entries for <strong>${escapeHtml(data.showName)}</strong> are confirmed.</p>
        <p style="color:#6b7280">${escapeHtml(data.showDate)}${data.showLocation ? `<br>${escapeHtml(data.showLocation)}` : ''}</p>
        <table style="width:100%;border-collapse:collapse">${entryRows}</table>
        <div style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:16px">
          <p style="margin:4px 0">Subtotal: <strong>${formatCurrency(data.subtotal)}</strong></p>
          <p style="margin:4px 0">Service fee: <strong>${formatCurrency(data.serviceFee)}</strong></p>
          ${refundPendingRow}
          <p style="margin:8px 0;font-size:18px">Total charged: <strong>${formatCurrency(data.total)}</strong></p>
        </div>
        <p style="margin-top:20px;color:#6b7280;font-size:14px">${ARMBAND_NOTE}</p>
        <p style="margin:20px 0 0"><a href="${escapeHtml(data.entriesUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">See your entries in My Shows</a></p>
      </div>
    </div>
  </body>
</html>`;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
