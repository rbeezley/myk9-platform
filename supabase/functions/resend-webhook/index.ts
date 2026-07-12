// supabase/functions/resend-webhook/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

import { verifyStandardWebhookSignature } from '../_shared/standardWebhookSignature.ts';

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
  // Resend validates webhook endpoints with GET/HEAD before saving
  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Response('OK', { status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.text();
    const verification = await verifyStandardWebhookSignature({
      headers: req.headers,
      body,
      secret: webhookSecret,
    });

    if (!verification.ok) {
      console.error(`Resend webhook rejected: ${verification.message}`);
      return new Response(verification.message, { status: verification.status });
    }

    const event = JSON.parse(body);
    return await handleEvent(event);
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

  // Only update if the status would actually change (idempotent)
  const { data: existing } = await supabase
    .from('email_log')
    .select('status')
    .eq('resend_message_id', event.data.email_id)
    .maybeSingle();

  if (existing && existing.status === newStatus) {
    // Already at this status — skip redundant write
    return new Response('OK', { status: 200 });
  }

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
