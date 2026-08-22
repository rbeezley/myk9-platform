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
  'sms_enabled, sms_phone_e164, sms_opt_in_at, sms_consent_text_version, sms_opt_in_source, sms_opt_out_at, sms_consent_write_token';

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
      createWriteToken: () => crypto.randomUUID(),
      now: () => new Date(),
      provider,
      rateLimit: {
        async claim(authUserId, phone) {
          const { data, error } = await supabase.rpc('claim_sms_opt_in_attempt', {
            p_auth_user_id: authUserId,
            p_phone_e164: phone,
          });
          if (error || typeof data !== 'boolean') {
            throw new HttpError(503, 'Text alert confirmation is temporarily unavailable');
          }
          return data;
        },
      },
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
          const { data, error } = rowExists
            ? await query
                .update(values)
                .eq('auth_user_id', values.auth_user_id)
                .select('auth_user_id')
                .maybeSingle()
            : await query.insert(values).select('auth_user_id').single();
          if (error) throw new HttpError(500, 'Could not save text alert consent');
          return data?.auth_user_id === values.auth_user_id;
        },
        async clearConsent(authUserId, write) {
          const { data, error } = await supabase
            .from('notification_preferences')
            .update({
              sms_enabled: false,
              sms_phone_e164: null,
              sms_opt_in_at: null,
              sms_consent_text_version: null,
              sms_opt_in_source: null,
              sms_opt_out_at: null,
              sms_consent_write_token: null,
            })
            .eq('auth_user_id', authUserId)
            .eq('sms_consent_write_token', write.sms_consent_write_token)
            .eq('sms_phone_e164', write.sms_phone_e164)
            .eq('sms_opt_in_at', write.sms_opt_in_at)
            .select('auth_user_id')
            .maybeSingle();
          if (error) throw new Error('Consent cleanup failed');
          return data?.auth_user_id === authUserId;
        },
      },
    });
  }
);
