// Builds the registration confirmation email. Deno-free so vitest can import it.

/** The armband is given out closer to the show, so the email says where the number will appear. */
const ARMBAND_NOTE =
  'Your armband number is assigned closer to the show. It will appear next to each dog in My Shows.';

/** What a check or cash entry still owes, in plain words. null for any other payment. */
export function payAtShowLine(
  method: 'check' | 'cash' | undefined,
  clubName: string | undefined
): string | null {
  if (method === 'check') {
    return `Pay at the show: check payable to ${clubName || 'the hosting club'}.`;
  }
  if (method === 'cash') return 'Pay at the show: cash, exact amount.';
  return null;
}

/** 'check' or 'cash' only while the entry is still unpaid; otherwise nothing is owed at the show. */
export function payAtShowMethod(
  paymentMethod: string | null | undefined,
  paymentStatus: string | null | undefined
): 'check' | 'cash' | undefined {
  if (paymentStatus !== 'pending') return undefined;
  return paymentMethod === 'check' || paymentMethod === 'cash' ? paymentMethod : undefined;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildRegistrationEmailHtml(data: {
  firstName: string;
  confirmationNumber: string;
  showName: string;
  showDates: string;
  showLocation: string;
  showVenue?: string;
  confirmationMessage?: string;
  entries: Array<{ dogName: string; className: string; armband?: string }>;
  subtotal: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  /** Where her entries are listed, for example https://myk9show.com/exhibitor/entries. */
  entriesUrl: string;
  /** The hosting club's name, for the check payee line. */
  clubName?: string | undefined;
  /** True while a check or cash entry is still unpaid: the email says to pay at the show. */
  payAtShow?: 'check' | 'cash' | undefined;
}): string {
  const brandColor = '#2563eb';

  const entriesHtml = data.entries
    .map(
      e =>
        `<tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
        <strong>${escapeHtml(e.dogName)}</strong><br>
        <span style="color: #6b7280; font-size: 14px;">${escapeHtml(e.className)}</span>
      </td>
      ${e.armband ? `<td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; text-align: right; color: #6b7280; font-size: 14px;">#${escapeHtml(e.armband)}</td>` : '<td></td>'}
    </tr>`
    )
    .join('');

  const messageSection = data.confirmationMessage
    ? `
    <div style="background-color: #eff6ff; border-radius: 6px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #3b82f6;">
      <p style="margin: 0 0 4px; font-weight: 600; font-size: 14px; color: #1e40af;">From the show secretary</p>
      <p style="margin: 0; color: #1e3a5f; font-size: 14px; line-height: 22px;">${escapeHtml(data.confirmationMessage)}</p>
    </div>`
    : '';

  const discountRow =
    data.discount && data.discount > 0
      ? `
    <table style="width: 100%; margin-bottom: 4px;"><tr>
      <td style="color: #6b7280; font-size: 14px;">Discount</td>
      <td style="color: #059669; font-size: 14px; text-align: right;">-${formatCurrency(data.discount)}</td>
    </tr></table>`
      : '';

  const paymentLine = payAtShowLine(data.payAtShow, data.clubName) ?? data.paymentMethod;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background-color: ${brandColor}; padding: 16px 24px;">
      <p style="color: #fff; font-size: 20px; font-weight: 600; margin: 0;">myK9Show</p>
    </div>
    <div style="padding: 32px 24px;">
      <h1 style="font-size: 24px; margin: 0 0 16px; color: #1a1a1e;">Registration Confirmed</h1>

      <div style="background-color: #ecfdf5; border-radius: 6px; padding: 16px; text-align: center; margin-bottom: 24px;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Confirmation Number</p>
        <p style="margin: 4px 0 0; font-size: 20px; font-weight: 600; color: #059669; font-family: monospace;">${escapeHtml(data.confirmationNumber)}</p>
      </div>

      <p style="color: #1a1a1e; font-size: 16px;">Hi ${escapeHtml(data.firstName)}, your registration has been confirmed.</p>

      <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <p style="margin: 0; font-weight: 600; font-size: 18px; color: #1a1a1e;">${escapeHtml(data.showName)}</p>
        <p style="margin: 4px 0 0; color: #6b7280; font-size: 14px;">${escapeHtml(data.showDates)}</p>
        <p style="margin: 2px 0 0; color: #6b7280; font-size: 14px;">${escapeHtml(data.showLocation)}${data.showVenue ? ` · ${escapeHtml(data.showVenue)}` : ''}</p>
      </div>

      ${messageSection}

      <h2 style="font-size: 16px; margin: 24px 0 12px; color: #1a1a1e;">Your Entries</h2>
      <table style="width: 100%; border-collapse: collapse;">${entriesHtml}</table>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px;">

      <table style="width: 100%; margin-bottom: 4px;"><tr>
        <td style="color: #6b7280; font-size: 14px;">Subtotal</td>
        <td style="font-size: 14px; text-align: right;">${formatCurrency(data.subtotal)}</td>
      </tr></table>
      ${discountRow}
      <table style="width: 100%; padding-top: 8px; border-top: 1px solid #e5e7eb;"><tr>
        <td style="font-weight: 600; font-size: 18px;">Total</td>
        <td style="font-weight: 600; font-size: 18px; text-align: right;">${formatCurrency(data.total)}</td>
      </tr></table>
      <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">${escapeHtml(paymentLine)}</p>
      <p style="color: #6b7280; font-size: 14px;">${ARMBAND_NOTE}</p>
      <p style="margin: 20px 0 0;"><a href="${escapeHtml(data.entriesUrl)}" style="display: inline-block; background-color: ${brandColor}; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">See your entries in My Shows</a></p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px;">
      <p style="color: #6b7280; font-size: 14px;">Questions? Contact the show secretary.</p>
    </div>
    <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} myK9Show. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}
