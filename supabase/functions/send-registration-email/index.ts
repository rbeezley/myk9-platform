// supabase/functions/send-registration-email/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'myK9Show <noreply@myk9show.com>';

const ALLOWED_ORIGINS = [
  'https://myk9-platform-myk9show.vercel.app',
  'https://myk9show.com',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
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

function buildRegistrationEmailHtml(data: {
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
      <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">${escapeHtml(data.paymentMethod)}</p>

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

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the caller's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a user-scoped client to verify identity
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { registrationId } = await req.json();

    if (!registrationId) {
      return new Response(JSON.stringify({ error: 'registrationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch registration with related data (include auth_user_id for ownership check)
    const { data: registration, error: regError } = await supabase
      .from('registrations')
      .select(
        '*, show:shows(name, start_date, end_date, location, venue_name, confirmation_message, club_id), person:people(first_name, last_name, email, auth_user_id)'
      )
      .eq('id', registrationId)
      .single();

    if (regError || !registration) {
      return new Response(JSON.stringify({ error: 'Registration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the caller owns this registration or is a secretary/admin for the show
    const isOwner = registration.person?.auth_user_id === user.id;
    let isSecretary = false;
    let isAdmin = false;

    if (!isOwner) {
      // Look up caller's person record (needed for both secretary and admin checks)
      const { data: callerPerson } = await supabase
        .from('people')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (callerPerson) {
        // Check secretary role for show's club
        if (registration.show?.club_id) {
          const { data: secretaryRole } = await supabase
            .from('user_roles')
            .select('id, role:roles!inner(name)')
            .eq('user_id', callerPerson.id)
            .eq('is_active', true)
            .eq('club_id', registration.show.club_id)
            .eq('roles.name', 'trial_secretary')
            .maybeSingle();
          isSecretary = !!secretaryRole;
        }

        // Check platform admin role via database (SA-014: not JWT claims)
        if (!isSecretary) {
          const { data: adminRole } = await supabase
            .from('user_roles')
            .select('id, role:roles!inner(name)')
            .eq('user_id', callerPerson.id)
            .eq('is_active', true)
            .in('roles.name', ['site_admin', 'platform_admin'])
            .maybeSingle();
          isAdmin = !!adminRole;
        }
      }
    }
    if (!isOwner && !isSecretary && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch entries for this registration
    const { data: entries } = await supabase
      .from('entries')
      .select('armband_number, dog:dogs(call_name), class:classes(name)')
      .eq('registration_id', registrationId);

    const recipientEmail = registration.person?.email;
    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'No email address for registrant' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const show = registration.show;
    const html = buildRegistrationEmailHtml({
      firstName: registration.person?.first_name || 'there',
      confirmationNumber:
        registration.confirmation_number || registrationId.slice(0, 8).toUpperCase(),
      showName: show?.name || 'Dog Show',
      showDates: `${show?.start_date || ''} — ${show?.end_date || ''}`,
      showLocation: show?.location || '',
      showVenue: show?.venue_name,
      confirmationMessage: show?.confirmation_message,
      entries: (entries || []).map(e => ({
        dogName: e.dog?.call_name || 'Unknown',
        className: e.class?.name || 'Unknown',
        armband: e.armband_number,
      })),
      subtotal: registration.total_amount || 0,
      discount: registration.discount_amount,
      total: registration.total_amount || 0,
      paymentMethod: registration.payment_method || 'Payment on file',
    });

    // Send via Resend with idempotency key
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
        'Idempotency-Key': registrationId,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipientEmail,
        subject: `Registration Confirmed — ${registration.confirmation_number || 'myK9Show'}`,
        html,
      }),
    });

    let resendMessageId: string | undefined;
    let sendStatus = 'sent';
    let errorMessage: string | undefined;

    if (response.ok) {
      const result = await response.json();
      resendMessageId = result.id;
      console.log(`Registration email sent: ${result.id} to ${recipientEmail}`);
    } else {
      const err = await response.json();
      sendStatus = 'failed';
      errorMessage = JSON.stringify(err);
      console.error('Resend API error:', err);
    }

    // Write email_log
    const { data: logRow } = await supabase
      .from('email_log')
      .insert({
        recipient_email: recipientEmail,
        email_type: 'registration_confirmation',
        related_id: registrationId,
        resend_message_id: resendMessageId,
        status: sendStatus,
        error_message: errorMessage,
      })
      .select('id')
      .single();

    return new Response(
      JSON.stringify({
        success: sendStatus === 'sent',
        emailLogId: logRow?.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('send-registration-email error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
