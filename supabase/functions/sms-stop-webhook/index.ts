// supabase/functions/sms-stop-webhook/index.ts
//
// Inbound Twilio webhook for ring-alert STOP/START/HELP keywords (MYK9-192).
//
// Deploy with `--no-verify-jwt`: Twilio sends no Authorization header, so the
// X-Twilio-Signature IS the authentication. Nothing touches the database until
// that signature verifies.
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

import {
  parseFormBody,
  resolveSignedUrl,
  verifyTwilioSignature,
} from '../_shared/sms/twilioSignature.ts';
import {
  handleInboundSms,
  type SmsConsentStateRow,
  type StartUpdate,
  type StopUpdate,
} from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CONSENT_STATE_COLUMNS =
  'id, upcoming_runs, sms_opt_out_at, sms_opt_in_at, sms_consent_text_version, ' +
  'sms_opt_in_source, sms_consent_write_token, sms_stop_muted_push_at';

/**
 * Twilio expects TwiML or an empty 200. An empty <Response/> tells it we are
 * not replying ourselves, which leaves its Advanced Opt-Out auto-replies — the
 * STOP confirmation and the §5 HELP text — to do the talking. Sending our own
 * body here would replace them.
 */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): Response {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const params = parseFormBody(rawBody);

    const verification = await verifyTwilioSignature({
      url: resolveSignedUrl(req.url, Deno.env.get('TWILIO_WEBHOOK_URL')),
      params,
      signature: req.headers.get('X-Twilio-Signature'),
      authToken: Deno.env.get('TWILIO_AUTH_TOKEN'),
    });
    if (!verification.ok) {
      // Never echo the reason to the caller in detail; log it for us instead.
      console.error(`sms-stop-webhook rejected: ${verification.message}`);
      return new Response(verification.message, { status: verification.status });
    }

    const from = params.From?.[0] ?? '';
    const body = params.Body?.[0];
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const result = await handleInboundSms(
      { from, body },
      {
        now: () => new Date(),
        async findByPhone(phone) {
          const { data, error } = await supabase
            .from('notification_preferences')
            .select(CONSENT_STATE_COLUMNS)
            .eq('sms_phone_e164', phone);
          if (error) throw new Error('Could not load consent rows');
          return (data ?? []) as SmsConsentStateRow[];
        },
        async applyUpdate(rowIds: string[], update: StopUpdate | StartUpdate) {
          const { error } = await supabase
            .from('notification_preferences')
            .update(update)
            .in('id', rowIds);
          if (error) throw new Error('Could not record the inbound keyword');
        },
      }
    );

    console.log(`sms-stop-webhook: keyword=${result.keyword} rows_updated=${result.updated}`);
    return twiml();
  } catch (error) {
    // A 500 makes Twilio retry, which is what we want for a transient database
    // failure: the alternative is a STOP our send path never learns about.
    console.error('sms-stop-webhook failed', error);
    return new Response('Internal error', { status: 500 });
  }
});
