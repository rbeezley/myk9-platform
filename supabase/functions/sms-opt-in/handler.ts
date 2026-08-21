import { HttpError } from '../_shared/http/responses.ts';
import { buildSmsOptInConfirmation, toE164 } from '../_shared/sms/smsMessage.ts';
import type { SmsProvider } from '../_shared/sms/smsProvider.ts';

export const SMS_CONSENT_TEXT_VERSION = 'sms-consent-v1';
export const SMS_OPT_IN_SOURCES = ['account-settings', 'entry-checkout'] as const;
export type SmsOptInSource = (typeof SMS_OPT_IN_SOURCES)[number];

export interface SmsOptInRequest {
  phone?: unknown;
  consentTextVersion?: unknown;
  source?: unknown;
}

export interface SmsConsentRow {
  sms_enabled: boolean | null;
  sms_phone_e164: string | null;
  sms_opt_in_at: string | null;
  sms_consent_text_version: string | null;
  sms_opt_in_source: string | null;
  sms_opt_out_at: string | null;
}

export interface SmsConsentWrite extends SmsConsentRow {
  auth_user_id: string;
}

export interface SmsOptInPreferences {
  findByUserId(authUserId: string): Promise<SmsConsentRow | null>;
  saveConsent(values: SmsConsentWrite, rowExists: boolean): Promise<void>;
  clearConsent(authUserId: string): Promise<void>;
}

export interface SmsOptInDependencies {
  authUserId: string;
  now: () => Date;
  provider: SmsProvider;
  preferences: SmsOptInPreferences;
}

function isSmsOptInSource(value: unknown): value is SmsOptInSource {
  return typeof value === 'string' && SMS_OPT_IN_SOURCES.includes(value as SmsOptInSource);
}

export async function handleSmsOptIn(body: SmsOptInRequest, deps: SmsOptInDependencies) {
  const phone = typeof body.phone === 'string' ? toE164(body.phone) : null;
  if (!phone) throw new HttpError(400, 'Enter a valid mobile number');
  if (body.consentTextVersion !== SMS_CONSENT_TEXT_VERSION) {
    throw new HttpError(400, 'Consent wording is out of date');
  }
  if (!isSmsOptInSource(body.source)) {
    throw new HttpError(400, 'Unsupported consent source');
  }

  const current = await deps.preferences.findByUserId(deps.authUserId);
  if (
    current?.sms_enabled === true &&
    current.sms_phone_e164 === phone &&
    current.sms_opt_in_at !== null &&
    current.sms_consent_text_version === SMS_CONSENT_TEXT_VERSION &&
    current.sms_opt_in_source === body.source &&
    current.sms_opt_out_at === null
  ) {
    return { status: 'already_enabled' as const, phone };
  }

  await deps.preferences.saveConsent(
    {
      auth_user_id: deps.authUserId,
      sms_enabled: true,
      sms_phone_e164: phone,
      sms_opt_in_at: deps.now().toISOString(),
      sms_consent_text_version: SMS_CONSENT_TEXT_VERSION,
      sms_opt_in_source: body.source,
      sms_opt_out_at: null,
    },
    current !== null
  );

  try {
    await deps.provider.send({ to: phone, body: buildSmsOptInConfirmation() });
  } catch (error) {
    try {
      await deps.preferences.clearConsent(deps.authUserId);
    } catch (clearError) {
      console.error('sms-opt-in: failed to clear consent after provider error', {
        authUserId: deps.authUserId,
        error: clearError instanceof Error ? clearError.message : 'unknown',
      });
    }
    console.error('sms-opt-in: confirmation delivery failed', {
      authUserId: deps.authUserId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    throw new HttpError(502, 'We could not send the confirmation. Please try again.');
  }

  return { status: 'enabled' as const, phone };
}
