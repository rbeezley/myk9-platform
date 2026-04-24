// supabase/functions/send-notification/index.ts
// Transactional emails: entry confirmation, payment receipt, result notification.
// Deploy with: supabase functions deploy send-notification --no-verify-jwt

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const resendApiKey = Deno.env.get('RESEND_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'https://myk9-platform-myk9show.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ── Email shell ──────────────────────────────────────────────────────────────

function emailShell(headerText: string, bodyHtml: string, appUrl = 'https://app.myk9show.com') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${headerText}</title>
</head>
<body style="margin:0;padding:0;background:#f8f8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
<tr><td align="center" style="padding:32px 16px;">
  <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

    <!-- Header -->
    <tr><td style="padding:28px 32px 24px;border-bottom:3px solid #0d9488;text-align:left;">
      <a href="${appUrl}" style="text-decoration:none;font-size:22px;font-weight:700;color:#0d9488;letter-spacing:-0.5px;">myK9Show</a>
    </td></tr>

    <!-- Accent bar -->
    <tr><td style="height:4px;background:linear-gradient(90deg,#0d9488,#0f766e);"></td></tr>

    <!-- Body -->
    <tr><td style="padding:32px;">
      ${bodyHtml}
    </td></tr>

    <!-- CTA -->
    <tr><td style="padding:0 32px 32px;text-align:center;">
      <a href="${appUrl}" style="display:inline-block;padding:12px 28px;background:#0d9488;color:#ffffff;font-weight:600;font-size:14px;border-radius:6px;text-decoration:none;">View in myK9Show</a>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;">
      <p style="margin:0 0 4px;">myK9Show · the modern dog show platform</p>
      <p style="margin:0;">
        <a href="${appUrl}/notifications" style="color:#9ca3af;">Manage notifications</a>
        &nbsp;·&nbsp;
        <a href="${appUrl}/preferences" style="color:#9ca3af;">Unsubscribe</a>
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Template builders ────────────────────────────────────────────────────────

interface EntryConfirmedData {
  recipientName: string;
  showName: string;
  dogName: string;
  classes: { name: string; fee: string }[];
  total: string;
  confirmationNumber: string;
  showDate: string;
  venue: string;
}

function entryConfirmedEmail(d: EntryConfirmedData) {
  const classRows = d.classes
    .map(
      c =>
        `<tr><td style="padding:6px 0;font-size:14px;">${c.name}</td><td style="padding:6px 0;font-size:14px;text-align:right;">${c.fee}</td></tr>`
    )
    .join('');

  const body = `
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Your entry is confirmed!</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Hi ${d.recipientName}, your entry has been received and confirmed.</p>

<div style="background:#f0fdf4;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#166534;">Confirmation #</p>
  <p style="margin:0;font-size:20px;font-weight:700;color:#166534;font-family:monospace;">${d.confirmationNumber}</p>
</div>

<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
  <tr><td colspan="2" style="padding-bottom:8px;font-weight:600;font-size:15px;">${d.showName}</td></tr>
  <tr><td style="font-size:13px;color:#6b7280;">Dog</td><td style="font-size:13px;text-align:right;">${d.dogName}</td></tr>
  <tr><td style="font-size:13px;color:#6b7280;">Date</td><td style="font-size:13px;text-align:right;">${d.showDate}</td></tr>
  <tr><td style="font-size:13px;color:#6b7280;">Venue</td><td style="font-size:13px;text-align:right;">${d.venue}</td></tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;">
  <tr><td colspan="2" style="padding:8px 0 4px;font-weight:600;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Classes entered</td></tr>
  ${classRows}
  <tr style="border-top:1px solid #e5e7eb;">
    <td style="padding:8px 0;font-weight:700;">Total paid</td>
    <td style="padding:8px 0;font-weight:700;text-align:right;">${d.total}</td>
  </tr>
</table>`;

  return {
    subject: `Entry confirmed — ${d.showName}`,
    html: emailShell('Entry Confirmed', body),
  };
}

interface PaymentReceiptData {
  recipientName: string;
  showName: string;
  amount: string;
  receiptNumber: string;
  date: string;
  paymentMethod: string;
}

function paymentReceiptEmail(d: PaymentReceiptData) {
  const body = `
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Payment receipt</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Hi ${d.recipientName}, here is your payment receipt.</p>

<div style="background:#f0fdf4;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#166534;">Amount paid</p>
  <p style="margin:0;font-size:28px;font-weight:700;color:#166534;">${d.amount}</p>
</div>

<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Receipt #</td><td style="padding:6px 0;font-size:14px;text-align:right;font-family:monospace;">${d.receiptNumber}</td></tr>
  <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Show</td><td style="padding:6px 0;font-size:14px;text-align:right;">${d.showName}</td></tr>
  <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Date</td><td style="padding:6px 0;font-size:14px;text-align:right;">${d.date}</td></tr>
  <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Method</td><td style="padding:6px 0;font-size:14px;text-align:right;">${d.paymentMethod}</td></tr>
</table>`;

  return {
    subject: `Payment receipt — ${d.showName}`,
    html: emailShell('Payment Receipt', body),
  };
}

interface ResultNotificationData {
  recipientName: string;
  dogName: string;
  showName: string;
  results: { className: string; result: string; score?: string }[];
}

function resultNotificationEmail(d: ResultNotificationData) {
  const rows = d.results
    .map(r => {
      const isQ = r.result === 'Q' || r.result === 'Qualified';
      const resultStyle = isQ ? 'color:#166534;font-weight:700;' : 'color:#6b7280;';
      return `<tr>
        <td style="padding:8px 0;font-size:14px;">${r.className}</td>
        <td style="padding:8px 0;font-size:14px;${resultStyle}text-align:center;">${r.result}${r.score ? ` (${r.score})` : ''}</td>
      </tr>`;
    })
    .join('');

  const body = `
<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Results posted</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Hi ${d.recipientName}, results have been posted for ${d.dogName} at ${d.showName}.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;">
  <tr>
    <th style="padding:8px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;text-align:left;">Class</th>
    <th style="padding:8px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;text-align:center;">Result</th>
  </tr>
  ${rows}
</table>`;

  return {
    subject: `Results posted — ${d.dogName} at ${d.showName}`,
    html: emailShell('Results Posted', body),
  };
}

// ── Request types ────────────────────────────────────────────────────────────

type NotificationType = 'entry_confirmed' | 'payment_receipt' | 'result_notification';

interface SendNotificationPayload {
  type: NotificationType;
  to: string; // recipient email
  data: EntryConfirmedData | PaymentReceiptData | ResultNotificationData;
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Auth: verify caller via Supabase JWT
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') ?? '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!resendApiKey) {
    console.error('send-notification: RESEND_API_KEY not configured');
    return json({ error: 'Email service not configured' }, 503);
  }

  let payload: SendNotificationPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { type, to, data } = payload;
  if (!type || !to || !data) {
    return json({ error: 'Missing required fields: type, to, data' }, 400);
  }

  let email: { subject: string; html: string };
  try {
    if (type === 'entry_confirmed') {
      email = entryConfirmedEmail(data as EntryConfirmedData);
    } else if (type === 'payment_receipt') {
      email = paymentReceiptEmail(data as PaymentReceiptData);
    } else if (type === 'result_notification') {
      email = resultNotificationEmail(data as ResultNotificationData);
    } else {
      return json({ error: `Unknown notification type: ${type}` }, 400);
    }
  } catch (err) {
    console.error('send-notification: template error', err);
    return json({ error: 'Template error' }, 500);
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: email.subject,
      html: email.html,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error('send-notification: Resend error:', errText);
    return json({ error: 'Failed to send email' }, 502);
  }

  const resendData = await resendRes.json();
  return json({ success: true, id: resendData.id });
});
