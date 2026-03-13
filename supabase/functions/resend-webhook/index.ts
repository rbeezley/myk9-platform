// supabase/functions/resend-webhook/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');

// Map Resend event types to our status values
const STATUS_MAP: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.delivery_delayed': 'sent', // keep as sent, just log delay
  'email.complained': 'complained',
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify webhook signature (Svix)
    if (webhookSecret) {
      const svixId = req.headers.get('svix-id');
      const svixTimestamp = req.headers.get('svix-timestamp');
      const svixSignature = req.headers.get('svix-signature');

      if (!svixId || !svixTimestamp || !svixSignature) {
        console.error('Missing Svix headers');
        return new Response('Missing signature headers', { status: 401 });
      }

      // Basic timestamp validation (within 5 minutes)
      const timestampSeconds = parseInt(svixTimestamp, 10);
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestampSeconds) > 300) {
        console.error('Webhook timestamp too old');
        return new Response('Timestamp too old', { status: 401 });
      }

      // Verify HMAC signature
      const body = await req.text();
      const signaturePayload = `${svixId}.${svixTimestamp}.${body}`;
      const secretBytes = Uint8Array.from(atob(webhookSecret.replace('whsec_', '')), c =>
        c.charCodeAt(0)
      );

      const key = await crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(signaturePayload)
      );
      const expectedSig = btoa(String.fromCharCode(...new Uint8Array(signature)));

      // Svix sends multiple signatures separated by spaces, each prefixed with "v1,"
      const signatures = svixSignature.split(' ').map(s => s.replace('v1,', ''));
      if (!signatures.includes(expectedSig)) {
        console.error('Invalid webhook signature');
        return new Response('Invalid signature', { status: 401 });
      }

      // Parse the verified body
      const event = JSON.parse(body);
      return await handleEvent(event);
    } else {
      // No secret configured — accept but log warning
      console.warn('RESEND_WEBHOOK_SECRET not set — skipping signature verification');
      const event = await req.json();
      return await handleEvent(event);
    }
  } catch (err) {
    console.error('resend-webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});

async function handleEvent(event: {
  type: string;
  data: { email_id: string; bounce_type?: string; error?: { message?: string } };
}) {
  const newStatus = STATUS_MAP[event.type];
  if (!newStatus) {
    // Unknown event type — acknowledge but don't process
    return new Response('OK', { status: 200 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const errorMessage =
    event.type === 'email.bounced'
      ? `${event.data.bounce_type || 'unknown'}: ${event.data.error?.message || ''}`
      : undefined;

  const { error } = await supabase
    .from('email_log')
    .update({
      status: newStatus,
      status_updated_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('resend_message_id', event.data.email_id);

  if (error) {
    console.error('Failed to update email_log:', error);
  }

  return new Response('OK', { status: 200 });
}
