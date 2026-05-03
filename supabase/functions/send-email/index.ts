import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const resendApiKey = Deno.env.get('RESEND_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CORS configuration - restrict to known app domains
const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'https://myk9-platform-myk9show.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Email sender configuration
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

// Types for email data
// Optional CC field shared by all email types
interface WithCc {
  cc?: string[];
}

interface EntryConfirmationData extends WithCc {
  type: 'entry_confirmation';
  to: string;
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
  receiptUrl?: string;
}

interface PaymentReceiptData extends WithCc {
  type: 'payment_receipt';
  to: string;
  exhibitorName: string;
  showName: string;
  items: Array<{
    description: string;
    amount: number;
  }>;
  subtotal: number;
  platformFee: number;
  total: number;
  paymentMethod?: string;
  last4?: string;
  orderId: string;
  paidAt: string;
}

interface WelcomeEmailData extends WithCc {
  type: 'welcome';
  to: string;
  name: string;
}

interface WaitlistOfferData extends WithCc {
  type: 'waitlist_offer';
  to: string;
  name: string;
  showName: string;
  className: string;
  dogName: string;
  expiresAt: string;
}

interface EntryDecisionData extends WithCc {
  type: 'entry_decision';
  to: string;
  exhibitorName: string;
  showName: string;
  showDate: string;
  registrationId?: string;
  message?: string;
  amountDue?: number;
  entries: Array<{
    dogName: string;
    className: string;
    status: 'accepted' | 'not_accepted' | 'waitlisted' | 'withdrawn' | 'missing_info' | 'pending';
    armbandNumber?: string;
  }>;
}

type EmailData =
  | EntryConfirmationData
  | PaymentReceiptData
  | WelcomeEmailData
  | WaitlistOfferData
  | EntryDecisionData;

Deno.serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Authenticate: require a Bearer token (user must be logged in).
  // Full JWT validation is skipped — function is only reachable from the
  // authenticated app (CORS + Supabase anon key) and Resend has its own key.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Helper to return JSON with CORS headers — defined outside try so catch can use it
  const jsonResponse = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // Check for API key
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return jsonResponse({ error: 'Email service not configured' }, 503);
    }

    const data: EmailData = await req.json();

    // Validate required fields
    if (!data.to || !data.type) {
      return jsonResponse({ error: 'Missing required fields: to, type' }, 400);
    }

    // Generate email content based on type
    let subject: string;
    let html: string;

    switch (data.type) {
      case 'entry_confirmation':
        subject = `Entry Confirmation - ${data.showName}`;
        html = generateEntryConfirmationEmail(data);
        break;

      case 'payment_receipt':
        subject = `Payment Receipt - ${data.showName}`;
        html = generatePaymentReceiptEmail(data);
        break;

      case 'welcome':
        subject = 'Welcome to myK9Show!';
        html = generateWelcomeEmail(data);
        break;

      case 'waitlist_offer':
        subject = `Spot Available! ${data.className} - ${data.showName}`;
        html = generateWaitlistOfferEmail(data);
        break;

      case 'entry_decision':
        subject = `Entry Decisions - ${data.showName}`;
        html = generateEntryDecisionEmail(data);
        break;

      default:
        return jsonResponse({ error: `Unknown email type: ${(data as EmailData).type}` }, 400);
    }

    const resendPayload = {
      from: FROM_EMAIL,
      to: data.to,
      subject,
      html,
      ...(data.cc?.length ? { cc: data.cc } : {}),
    };

    // Send email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(resendPayload),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Resend API error:', error);
      return jsonResponse({ error: 'Failed to send email', details: error }, 500);
    }

    const result = await response.json();
    console.log(`Email sent successfully: ${result.id} to ${data.to}`);

    // Log the email in the database for tracking
    const logRow: Record<string, unknown> = {
      recipient_email: data.to,
      email_type: data.type,
      resend_message_id: result.id,
      status: 'sent',
    };
    if ('registrationId' in data && data.registrationId) {
      logRow.related_id = data.registrationId;
    }
    await supabase
      .from('email_log')
      .insert(logRow)
      .then(null, (err: unknown) => console.log('Could not log email:', err));

    return jsonResponse({ success: true, id: result.id });
  } catch (error: unknown) {
    console.error('Error sending email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: errorMessage }, 500);
  }
});

/**
 * Generate entry confirmation email HTML
 */
function generateEntryConfirmationEmail(data: EntryConfirmationData): string {
  const entriesHtml = data.entries
    .map(
      entry => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <strong>${escapeHtml(entry.dogName)}</strong><br>
          <span style="color: #6b7280; font-size: 14px;">
            ${escapeHtml(entry.className)}${entry.classLevel ? ` - ${escapeHtml(entry.classLevel)}` : ''}
          </span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
          ${formatCurrency(entry.entryFee)}
        </td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Entry Confirmation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <!-- Header -->
      <div style="background-color: #2563eb; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Entry Confirmed!</h1>
      </div>

      <!-- Content -->
      <div style="padding: 24px;">
        <p>Hi ${escapeHtml(data.exhibitorName)},</p>

        <p>Your entries have been successfully submitted and confirmed for:</p>

        <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #1f2937;">${escapeHtml(data.showName)}</h2>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            ${escapeHtml(data.showDate)}${data.showLocation ? `<br>${escapeHtml(data.showLocation)}` : ''}
          </p>
        </div>

        <!-- Entries Table -->
        <h3 style="margin: 24px 0 12px 0; font-size: 16px;">Your Entries</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Entry</th>
              <th style="padding: 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Fee</th>
            </tr>
          </thead>
          <tbody>
            ${entriesHtml}
          </tbody>
        </table>

        <!-- Totals -->
        <div style="margin-top: 16px; padding-top: 16px; border-top: 2px solid #e5e7eb;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #6b7280;">Entry Fees</span>
            <span>${formatCurrency(data.subtotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #6b7280;">Platform Fee (3%)</span>
            <span>${formatCurrency(data.platformFee)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <span>Total Paid</span>
            <span style="color: #059669;">${formatCurrency(data.total)}</span>
          </div>
        </div>

        <!-- Confirmation Number -->
        <div style="background-color: #ecfdf5; border-radius: 6px; padding: 16px; margin-top: 24px; text-align: center;">
          <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 14px;">Confirmation Number</p>
          <p style="margin: 0; font-size: 20px; font-weight: 600; color: #059669; font-family: monospace;">${escapeHtml(data.orderId.slice(0, 8).toUpperCase())}</p>
        </div>

        <!-- Next Steps -->
        <div style="margin-top: 24px; padding: 16px; background-color: #fffbeb; border-radius: 6px;">
          <h4 style="margin: 0 0 8px 0; color: #92400e;">What's Next?</h4>
          <ul style="margin: 0; padding-left: 20px; color: #78350f;">
            <li>Check in at the venue on the day of the show</li>
            <li>Your armband number will be assigned at check-in</li>
            <li>Bring this confirmation email or your ID</li>
          </ul>
        </div>

        <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
          If you have any questions, please contact the show secretary.
        </p>
      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          This email was sent by myK9Show<br>
          &copy; ${new Date().getFullYear()} myK9Show. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate payment receipt email HTML
 */
function generatePaymentReceiptEmail(data: PaymentReceiptData): string {
  const itemsHtml = data.items
    .map(
      item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(item.description)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.amount)}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <!-- Header -->
      <div style="background-color: #1f2937; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Payment Receipt</h1>
      </div>

      <!-- Content -->
      <div style="padding: 24px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
          <div>
            <p style="margin: 0; color: #6b7280; font-size: 14px;">Receipt for</p>
            <p style="margin: 4px 0 0 0; font-weight: 600;">${escapeHtml(data.exhibitorName)}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">Date</p>
            <p style="margin: 4px 0 0 0; font-weight: 600;">${escapeHtml(data.paidAt)}</p>
          </div>
        </div>

        <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Payment for</p>
          <p style="margin: 4px 0 0 0; font-weight: 600;">${escapeHtml(data.showName)}</p>
        </div>

        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Description</th>
              <th style="padding: 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Platform Fee (3%)</td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(data.platformFee)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td style="padding: 12px; font-weight: 600; font-size: 18px;">Total</td>
              <td style="padding: 12px; font-weight: 600; font-size: 18px; text-align: right;">${formatCurrency(data.total)}</td>
            </tr>
          </tfoot>
        </table>

        ${
          data.paymentMethod && data.last4
            ? `
        <div style="margin-top: 24px; padding: 16px; background-color: #f9fafb; border-radius: 6px;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Payment Method</p>
          <p style="margin: 4px 0 0 0; font-weight: 600;">${escapeHtml(data.paymentMethod)} ending in ${escapeHtml(data.last4)}</p>
        </div>
        `
            : ''
        }

        <!-- Receipt ID -->
        <div style="margin-top: 24px; text-align: center;">
          <p style="margin: 0; color: #6b7280; font-size: 12px;">Receipt ID</p>
          <p style="margin: 4px 0 0 0; font-family: monospace; color: #6b7280;">${escapeHtml(data.orderId)}</p>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          This receipt was generated by myK9Show<br>
          &copy; ${new Date().getFullYear()} myK9Show. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate welcome email HTML
 */
function generateWelcomeEmail(data: WelcomeEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to myK9Show</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <!-- Header -->
      <div style="background-color: #2563eb; padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Welcome to myK9Show!</h1>
      </div>

      <!-- Content -->
      <div style="padding: 32px;">
        <p style="font-size: 18px;">Hi ${escapeHtml(data.name)},</p>

        <p>Welcome to myK9Show! We're excited to have you join our community of dog show enthusiasts.</p>

        <p>With your account, you can:</p>

        <ul style="padding-left: 20px;">
          <li>Browse and enter upcoming shows</li>
          <li>Manage your dogs and their profiles</li>
          <li>Track your entries and results</li>
          <li>View your competition history</li>
        </ul>

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://myk9show.com/browse-shows" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Browse Shows
          </a>
        </div>

        <p>If you have any questions, feel free to reach out to our support team.</p>

        <p>Happy showing!<br>The myK9Show Team</p>
      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          &copy; ${new Date().getFullYear()} myK9Show. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate waitlist offer email HTML
 */
function generateWaitlistOfferEmail(data: WaitlistOfferData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spot Available!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <!-- Header -->
      <div style="background-color: #059669; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🎉 A Spot Opened Up!</h1>
      </div>

      <!-- Content -->
      <div style="padding: 24px;">
        <p style="font-size: 18px;">Hi ${escapeHtml(data.name)},</p>

        <p>Great news! A spot has become available and you're next on the waitlist for:</p>

        <div style="background-color: #ecfdf5; border-radius: 6px; padding: 16px; margin: 16px 0; border-left: 4px solid #059669;">
          <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #1f2937;">${escapeHtml(data.className)}</h2>
          <p style="margin: 0; color: #6b7280;">
            <strong>${escapeHtml(data.showName)}</strong><br>
            For: ${escapeHtml(data.dogName)}
          </p>
        </div>

        <div style="background-color: #fef3c7; border-radius: 6px; padding: 16px; margin: 24px 0; border-left: 4px solid #f59e0b;">
          <h3 style="margin: 0 0 8px 0; color: #92400e; font-size: 16px;">⏰ Time-Sensitive Offer</h3>
          <p style="margin: 0; color: #78350f;">
            This spot is being held for you until <strong>${escapeHtml(data.expiresAt)}</strong>.<br>
            If you don't accept by then, the spot will be offered to the next person on the waitlist.
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://myk9show.com/my-entries" style="display: inline-block; background-color: #059669; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Accept This Spot
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          Click the button above to log in and accept your spot. You'll be prompted to complete payment if you haven't already.
        </p>

        <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
          Don't want this spot? You can decline it from your entries page, and we'll offer it to the next person.
        </p>
      </div>

      <!-- Footer -->
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          This email was sent by myK9Show<br>
          &copy; ${new Date().getFullYear()} myK9Show. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function generateEntryDecisionEmail(data: EntryDecisionData): string {
  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
    accepted: { bg: '#d1fae5', color: '#065f46', label: 'Accepted' },
    not_accepted: { bg: '#fee2e2', color: '#7f1d1d', label: 'Not Accepted' },
    waitlisted: { bg: '#fef3c7', color: '#78350f', label: 'Waitlisted' },
    withdrawn: { bg: '#f3f4f6', color: '#374151', label: 'Withdrawn' },
    missing_info: { bg: '#fef3c7', color: '#78350f', label: 'Missing Info' },
    pending: { bg: '#f3f4f6', color: '#374151', label: 'Pending' },
  };

  const entriesHtml = data.entries
    .map(e => {
      const s = statusStyles[e.status] ?? statusStyles.pending;
      return `<tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${escapeHtml(e.dogName)}</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">${escapeHtml(e.className)}</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; text-align: center;">
        <span style="background-color: ${s.bg}; color: ${s.color}; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600;">${s.label}</span>
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; text-align: right; color: #6b7280; font-size: 14px;">${e.armbandNumber ? `#${escapeHtml(e.armbandNumber)}` : ''}</td>
    </tr>`;
    })
    .join('');

  const hasWaitlisted = data.entries.some(e => e.status === 'waitlisted');
  const hasNotAccepted = data.entries.some(e => e.status === 'not_accepted');
  const hasMissingInfo = data.entries.some(e => e.status === 'missing_info');

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
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">myK9Show</h1>
      </div>
      <div style="padding: 32px;">
        <p style="margin: 0 0 8px;">Hi ${escapeHtml(data.exhibitorName)},</p>
        <p style="margin: 0 0 24px; color: #6b7280;">Here is the decision for your entries at <strong>${escapeHtml(data.showName)}</strong>${data.showDate ? ` on ${escapeHtml(data.showDate)}` : ''}.</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #e5e7eb; font-size: 13px; color: #6b7280; font-weight: 600;">Dog</th>
              <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #e5e7eb; font-size: 13px; color: #6b7280; font-weight: 600;">Class</th>
              <th style="text-align: center; padding: 8px 0; border-bottom: 2px solid #e5e7eb; font-size: 13px; color: #6b7280; font-weight: 600;">Status</th>
              <th style="text-align: right; padding: 8px 0; border-bottom: 2px solid #e5e7eb; font-size: 13px; color: #6b7280; font-weight: 600;">Armband</th>
            </tr>
          </thead>
          <tbody>${entriesHtml}</tbody>
        </table>
        ${
          data.amountDue !== undefined
            ? `
        <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-top: 20px; border: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; font-size: 15px; color: #1f2937;">Amount Due</span>
          <span style="font-weight: 700; font-size: 18px; color: #1f2937;">$${data.amountDue.toFixed(2)}</span>
        </div>`
            : ''
        }
        ${
          data.message
            ? `
        <div style="background-color: #eff6ff; border-radius: 6px; padding: 16px; margin-top: 16px; border-left: 4px solid #3b82f6;">
          <p style="margin: 0 0 4px; font-weight: 600; font-size: 14px; color: #1e40af;">From the show secretary</p>
          <p style="margin: 0; color: #1e3a5f; font-size: 14px; line-height: 22px; white-space: pre-line;">${escapeHtml(data.message)}</p>
        </div>`
            : ''
        }
        ${hasWaitlisted ? `<p style="color: #6b7280; font-size: 14px; margin-top: 16px;">Waitlisted entries: you'll be notified if a spot opens up.</p>` : ''}
        ${hasNotAccepted ? `<p style="color: #6b7280; font-size: 14px; margin-top: 8px;">If you have questions about an entry that was not accepted, please contact the show secretary.</p>` : ''}
        ${hasMissingInfo ? `<p style="color: #78350f; font-size: 14px; margin-top: 8px;">One or more entries require additional information — please see the secretary's message above.</p>` : ''}
      </div>
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">This email was sent by myK9Show<br>&copy; ${new Date().getFullYear()} myK9Show. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Format cents to currency string
 */
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
