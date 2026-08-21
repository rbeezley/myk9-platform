import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { createTwilioSmsProvider, readTwilioConfig } from '../_shared/sms/twilioSmsProvider.ts';
import {
  handleSmsOptIn,
  type SmsConsentRow,
  type SmsConsentWrite,
  type SmsOptInRequest,
} from './handler.ts';

const CONSENT_COLUMNS =
  'sms_enabled, sms_phone_e164, sms_opt_in_at, sms_consent_text_version, sms_opt_in_source, sms_opt_out_at';

handle<SmsOptInRequest>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body, user, supabase }) => {
    if (!user) throw new HttpError(401, 'Authentication failed');

    let provider;
    try {
      provider = createTwilioSmsProvider(readTwilioConfig(name => Deno.env.get(name)));
    } catch {
      console.error('sms-opt-in: required provider configuration is missing');
      throw new HttpError(503, 'Text alerts are not available yet');
    }

    return handleSmsOptIn(body, {
      authUserId: user.id,
      now: () => new Date(),
      provider,
      preferences: {
        async findByUserId(authUserId) {
          const { data, error } = await supabase
            .from('notification_preferences')
            .select(CONSENT_COLUMNS)
            .eq('auth_user_id', authUserId)
            .maybeSingle();
          if (error) throw new HttpError(500, 'Could not load text alert settings');
          return (data as SmsConsentRow | null) ?? null;
        },
        async saveConsent(values: SmsConsentWrite, rowExists) {
          const query = supabase.from('notification_preferences');
          const { error } = rowExists
            ? await query.update(values).eq('auth_user_id', values.auth_user_id)
            : await query.insert(values);
          if (error) throw new HttpError(500, 'Could not save text alert consent');
        },
        async clearConsent(authUserId) {
          const { error } = await supabase
            .from('notification_preferences')
            .update({
              sms_enabled: false,
              sms_phone_e164: null,
              sms_opt_in_at: null,
              sms_consent_text_version: null,
              sms_opt_in_source: null,
              sms_opt_out_at: null,
            })
            .eq('auth_user_id', authUserId);
          if (error) throw new Error('Consent cleanup failed');
        },
      },
    });
  }
);
