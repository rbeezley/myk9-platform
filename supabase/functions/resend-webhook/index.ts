// supabase/functions/resend-webhook/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

import { verifyStandardWebhookSignature } from '../_shared/standardWebhookSignature.ts';
import { persistAuthEmailDeliveryFailureAlert } from '../_shared/authEmailAlerts.ts';
import {
  handleResendEmailEvent,
  type EmailLogDeliveryRow,
  type ResendEmailEvent,
} from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');

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

    const event = JSON.parse(body) as ResendEmailEvent;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await handleResendEmailEvent(event, {
      findEmailLog: async messageId => {
        const { data, error } = await supabase
          .from('email_log')
          .select('status, recipient_email, email_type')
          .eq('resend_message_id', messageId)
          .maybeSingle();
        return { data: data as EmailLogDeliveryRow | null, error };
      },
      updateEmailLog: async (messageId, update) => {
        const { error } = await supabase
          .from('email_log')
          .update(update)
          .eq('resend_message_id', messageId);
        return { error };
      },
      persistAuthFailureAlert: alert => persistAuthEmailDeliveryFailureAlert(supabase, alert),
    });

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('resend-webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
