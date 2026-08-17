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
  platformFee: number;
  total: number;
  orderId: string;
}

export function renderStripeEntryConfirmationEmail(data: StripeEntryConfirmationEmailData): string {
  const entryRows = data.entries
    .map(
      entry => `<tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb">
          <strong>${escapeHtml(entry.dogName)}</strong><br>
          <span style="color:#6b7280;font-size:14px">${escapeHtml(entry.className)}${entry.classLevel ? ` — ${escapeHtml(entry.classLevel)}` : ''}</span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right">${formatCurrency(entry.entryFee)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937">
    <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden">
      <div style="background:#2563eb;padding:24px;text-align:center">
        <h1 style="margin:0;color:#fff;font-size:24px">Entry confirmed</h1>
      </div>
      <div style="padding:28px 24px">
        <p>Hi ${escapeHtml(data.exhibitorName)}, your paid entries for <strong>${escapeHtml(data.showName)}</strong> are confirmed.</p>
        <p style="color:#6b7280">${escapeHtml(data.showDate)}${data.showLocation ? `<br>${escapeHtml(data.showLocation)}` : ''}</p>
        <table style="width:100%;border-collapse:collapse">${entryRows}</table>
        <div style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:16px">
          <p style="margin:4px 0">Subtotal: <strong>${formatCurrency(data.subtotal)}</strong></p>
          <p style="margin:4px 0">Platform fee: <strong>${formatCurrency(data.platformFee)}</strong></p>
          <p style="margin:8px 0;font-size:18px">Total: <strong>${formatCurrency(data.total)}</strong></p>
          <p style="color:#6b7280;font-size:12px">Order ${escapeHtml(data.orderId)}</p>
        </div>
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
