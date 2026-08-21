import { supabase } from '@/lib/supabase';
import { toE164 } from '../../../../../supabase/functions/_shared/sms/smsMessage';

export const SMS_CONSENT_TEXT_VERSION = 'sms-consent-v1';
export const SMS_CONSENT_TEXT =
  'Text me when my dog is close to the ring. By checking this box I agree to receive SMS ring alerts from myK9Show at the number above. Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help.';

export type SmsOptInSource = 'account-settings' | 'entry-checkout';

export interface SmsNotificationPreference {
  auth_user_id: string;
  upcoming_runs: boolean | null;
  sms_enabled: boolean | null;
  sms_phone_e164: string | null;
  sms_opt_in_at: string | null;
  sms_consent_text_version: string | null;
  sms_opt_in_source: string | null;
  sms_opt_out_at: string | null;
}

export interface SmsOptInResult {
  status: 'enabled' | 'already_enabled';
  phone: string;
}

export const normalizeSmsPhone = toE164;

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
}

interface NotificationPreferencesTable {
  select(columns: string): {
    eq(
      column: string,
      value: string
    ): {
      maybeSingle(): Promise<QueryResult<SmsNotificationPreference | null>>;
    };
  };
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): Promise<QueryResult<unknown>>;
  };
  insert(values: Record<string, unknown>): Promise<QueryResult<unknown>>;
}

function preferencesTable(): NotificationPreferencesTable {
  return (supabase as unknown as { from(table: string): NotificationPreferencesTable }).from(
    'notification_preferences'
  );
}

const SMS_COLUMNS = [
  'auth_user_id',
  'upcoming_runs',
  'sms_enabled',
  'sms_phone_e164',
  'sms_opt_in_at',
  'sms_consent_text_version',
  'sms_opt_in_source',
  'sms_opt_out_at',
].join(', ');

export async function loadSmsNotificationPreference(
  authUserId: string | null | undefined
): Promise<SmsNotificationPreference | null> {
  if (!authUserId) return null;
  const { data, error } = await preferencesTable()
    .select(SMS_COLUMNS)
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) throw new Error('Could not load text alert settings');
  return data;
}

export async function setRingAlertsEnabled(
  authUserId: string | null | undefined,
  enabled: boolean
): Promise<boolean> {
  if (!authUserId) return false;
  try {
    const table = preferencesTable();
    const current = await loadSmsNotificationPreference(authUserId);
    const { error } = current
      ? await table.update({ upcoming_runs: enabled }).eq('auth_user_id', authUserId)
      : await table.insert({ auth_user_id: authUserId, upcoming_runs: enabled });
    return error === null;
  } catch {
    return false;
  }
}

export async function setSmsDeliveryEnabled(
  authUserId: string | null | undefined,
  enabled: boolean
): Promise<boolean> {
  if (!authUserId) return false;
  const { error } = await preferencesTable()
    .update({ sms_enabled: enabled })
    .eq('auth_user_id', authUserId);
  return error === null;
}

export async function clearSmsConsent(authUserId: string | null | undefined): Promise<boolean> {
  if (!authUserId) return false;
  const { error } = await preferencesTable()
    .update({
      sms_enabled: false,
      sms_phone_e164: null,
      sms_opt_in_at: null,
      sms_consent_text_version: null,
      sms_opt_in_source: null,
      sms_opt_out_at: null,
    })
    .eq('auth_user_id', authUserId);
  return error === null;
}

export async function requestSmsOptIn(
  phone: string,
  source: SmsOptInSource
): Promise<SmsOptInResult> {
  if (!toE164(phone)) throw new Error('Enter a valid mobile number');

  const { data, error } = await supabase.functions.invoke<SmsOptInResult>('sms-opt-in', {
    body: { phone, consentTextVersion: SMS_CONSENT_TEXT_VERSION, source },
  });
  if (error || !data) throw new Error('Could not turn on text alerts');
  return data;
}

export function isValidSmsConsent(
  preference: SmsNotificationPreference | null,
  phone: string
): boolean {
  const normalized = toE164(phone);
  return Boolean(
    preference &&
    normalized &&
    preference.sms_phone_e164 === normalized &&
    preference.sms_opt_in_at &&
    preference.sms_consent_text_version === SMS_CONSENT_TEXT_VERSION &&
    preference.sms_opt_in_source &&
    preference.sms_opt_out_at === null
  );
}
