interface WithCc {
  cc?: string[];
}

export interface SupportNotificationData extends WithCc {
  type: 'support_notification';
  to: string;
  name: string;
  ticketId: string;
  ticketSubject: string;
  senderName: string;
  preview: string;
  actionUrl: string;
}

export function generateSupportNotificationEmail(data: SupportNotificationData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background-color: #1f2937; padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Support update</h1>
      </div>
      <div style="padding: 32px;">
        <p style="margin: 0 0 12px;">Hi ${escapeHtml(data.name)},</p>
        <p style="margin: 0 0 16px;"><strong>${escapeHtml(data.senderName)}</strong> replied to <strong>${escapeHtml(data.ticketSubject)}</strong>.</p>
        <div style="border-left: 4px solid #2563eb; padding: 10px 0 10px 16px; margin: 18px 0; color: #4b5563;">
          ${escapeHtml(data.preview)}
        </div>
        <p style="margin: 24px 0;">
          <a href="${escapeHtml(data.actionUrl)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open ticket</a>
        </p>
        <p style="font-size: 13px; color: #6b7280; margin: 0;">Replies are handled in myK9Show.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
