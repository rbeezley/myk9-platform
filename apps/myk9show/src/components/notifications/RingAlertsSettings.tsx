import { useEffect, useState } from 'react';
import { Bell, Send, MessageSquareText } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { useNotificationStore } from '@/store/notificationStore';
import { syncNotificationPreferences } from '@/features/notifications/notificationPreferenceSync';
import {
  clearSmsConsent,
  isValidSmsConsent,
  loadSmsNotificationPreference,
  normalizeSmsPhone,
  requestSmsOptIn,
  setRingAlertsEnabled,
  setSmsDeliveryEnabled,
  SMS_CONSENT_TEXT,
  SMS_CONSENT_TEXT_VERSION,
  type SmsNotificationPreference,
} from '@/features/notifications/smsPreferenceService';
import { getSmsSendingNumber } from '@/features/notifications/smsSendingNumber';
import { notifications } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

/** "Feb 14, 2026" — app-standard en-US, unambiguous about the day sending stopped. */
function formatStopDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'an earlier date'
    : date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

const clearedSmsPreference = (
  preference: SmsNotificationPreference
): SmsNotificationPreference => ({
  ...preference,
  sms_enabled: false,
  sms_phone_e164: null,
  sms_opt_in_at: null,
  sms_consent_text_version: null,
  sms_opt_in_source: null,
  sms_opt_out_at: null,
  sms_consent_write_token: null,
  sms_stop_muted_push_at: null,
});

export function RingAlertsSettings() {
  const preferences = useNotificationStore(state => state.preferences);
  const permissionStatus = useNotificationStore(state => state.permissionStatus);
  const updatePreferences = useNotificationStore(state => state.updatePreferences);
  const { user } = useAuthContext();
  const { subscribe, unsubscribe, isSupported: isPushSupported } = usePushSubscription();
  const [smsPreference, setSmsPreference] = useState<SmsNotificationPreference | null>(null);
  const [ringAlertsEnabled, setRingAlertsEnabledState] = useState(true);
  const [phone, setPhone] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [isSmsSaving, setIsSmsSaving] = useState(false);
  const [smsLoadFailed, setSmsLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setSmsLoadFailed(false);
    setError(null);

    void loadSmsNotificationPreference(user?.id)
      .then(row => {
        if (!active) return;
        setSmsPreference(row);
        setPhone(row?.sms_phone_e164 ?? '');
        if (typeof row?.upcoming_runs === 'boolean') {
          setRingAlertsEnabledState(row.upcoming_runs);
        }
      })
      .catch(() => {
        if (active) {
          setSmsLoadFailed(true);
          setError('We could not load text alert settings. Refresh this page to try again.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id, updatePreferences]);

  const hasValidConsent = isValidSmsConsent(smsPreference, phone);
  const optedOutAt = smsPreference?.sms_opt_out_at ?? null;
  const stopMutedPush = smsPreference?.sms_stop_muted_push_at != null;
  const sendingNumber = getSmsSendingNumber();

  async function handleRingAlertsToggle(checked: boolean) {
    const previous = ringAlertsEnabled;
    setRingAlertsEnabledState(checked);
    setError(null);
    if (!(await setRingAlertsEnabled(user?.id, checked))) {
      setRingAlertsEnabledState(previous);
      setError('We could not update ring alerts. Please try again.');
    }
  }

  function handleLeadDogsChange(value: number) {
    updatePreferences({ leadDogs: value });
    void syncNotificationPreferences(user?.id, {
      leadDogs: value,
      pushEnabled: preferences.pushEnabled,
    });
  }

  async function handlePushToggle(checked: boolean) {
    setIsPushLoading(true);
    try {
      const result = checked ? await subscribe() : await unsubscribe();
      if (!result.ok) {
        if ('reason' in result && result.reason === 'permission-denied') {
          notifications.warning('Push notifications blocked. Check browser settings.');
        } else {
          notifications.error(`Failed to ${checked ? 'enable' : 'disable'} push notifications.`);
        }
      }
    } finally {
      setIsPushLoading(false);
      const settled = useNotificationStore.getState().preferences;
      void syncNotificationPreferences(user?.id, {
        leadDogs: settled.leadDogs,
        pushEnabled: settled.pushEnabled,
      });
    }
  }

  async function handleSmsToggle(checked: boolean) {
    if (!smsPreference || !hasValidConsent) return;
    setIsSmsSaving(true);
    setError(null);
    const saved = await setSmsDeliveryEnabled(user?.id, checked);
    if (saved) {
      setSmsPreference({ ...smsPreference, sms_enabled: checked });
    } else {
      setError('We could not update text alerts. Please try again.');
    }
    setIsSmsSaving(false);
  }

  async function handlePhoneBlur() {
    if (!smsPreference || !isValidSmsConsent(smsPreference, smsPreference.sms_phone_e164 ?? '')) {
      return;
    }
    if (isValidSmsConsent(smsPreference, phone)) return;

    setIsSmsSaving(true);
    setError(null);
    const cleared = await clearSmsConsent(user?.id, smsPreference);
    if (cleared) {
      setSmsPreference(clearedSmsPreference(smsPreference));
      setConsentChecked(false);
    } else {
      setError('We could not update the mobile number. Please try again.');
    }
    setIsSmsSaving(false);
  }

  async function handleSmsOptIn() {
    const normalizedPhone = normalizeSmsPhone(phone);
    if (!normalizedPhone) {
      setError('Enter a valid mobile number, including area code.');
      return;
    }
    if (!consentChecked) {
      setError('Check the consent box to turn on text alerts.');
      return;
    }

    setIsSmsSaving(true);
    setError(null);
    try {
      const result = await requestSmsOptIn(phone, 'account-settings');
      setPhone(result.phone);
      setSmsPreference({
        auth_user_id: user?.id ?? '',
        upcoming_runs: ringAlertsEnabled,
        sms_enabled: true,
        sms_phone_e164: result.phone,
        sms_opt_in_at: result.optInAt,
        sms_consent_text_version: SMS_CONSENT_TEXT_VERSION,
        sms_opt_in_source: 'account-settings',
        sms_opt_out_at: null,
        sms_consent_write_token: result.writeToken,
        sms_stop_muted_push_at: null,
      });
      setConsentChecked(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'We could not turn on text alerts. Please try again.'
      );
    } finally {
      setIsSmsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">
                <label htmlFor="ring-alerts-enabled">Ring alerts</label>
              </CardTitle>
              <CardDescription className="text-xs">
                Turn this off to stop both push notifications and text messages.
              </CardDescription>
            </div>
          </div>
          <Switch
            id="ring-alerts-enabled"
            checked={ringAlertsEnabled}
            disabled={isLoading}
            onCheckedChange={handleRingAlertsToggle}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <label htmlFor="lead-dogs" className="block text-sm font-medium mb-2">
            Alert when this many dogs ahead: {preferences.leadDogs}
          </label>
          <Slider
            id="lead-dogs"
            min={1}
            max={5}
            step={1}
            value={[preferences.leadDogs]}
            onValueChange={([value]) => handleLeadDogsChange(value)}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1</span>
            <span>5</span>
          </div>
        </div>

        <Separator />
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Deliver by
        </Label>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Send className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <label htmlFor="push-enabled" className="text-sm font-medium">
                Push notifications
              </label>
              <p className="text-xs text-muted-foreground">
                Alerts on your lock screen and in notification center.
              </p>
              {permissionStatus === 'denied' && (
                <p className="text-xs text-destructive mt-1">Blocked in browser settings</p>
              )}
              {!isPushSupported && (
                <p className="text-xs text-muted-foreground mt-1">Not supported on this browser</p>
              )}
            </div>
          </div>
          <Switch
            id="push-enabled"
            checked={preferences.pushEnabled}
            disabled={!ringAlertsEnabled || !isPushSupported || isPushLoading}
            onCheckedChange={handlePushToggle}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <MessageSquareText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <label htmlFor="sms-enabled" className="text-sm font-medium">
                  Text message
                </label>
                <p className="text-xs text-muted-foreground">
                  One text when your dog is close to the ring.
                </p>
              </div>
            </div>
            {/*
              No toggle once a STOP is on record. Flipping SMS back on here
              would light up a control that changes nothing: STOP is enforced by
              Twilio at the carrier, and clearing our column does not touch
              their block list. An app that says "on" while no text ever
              arrives is a worse support conversation than "you replied STOP".
            */}
            {optedOutAt === null && (
              <Switch
                id="sms-enabled"
                checked={smsPreference?.sms_enabled === true}
                disabled={
                  !ringAlertsEnabled || isLoading || isSmsSaving || smsLoadFailed || !hasValidConsent
                }
                onCheckedChange={handleSmsToggle}
              />
            )}
          </div>

          {optedOutAt !== null ? (
            <div
              className="ml-6 space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm"
              role="status"
            >
              <p>
                You replied STOP to ring alerts on{' '}
                <strong>{formatStopDate(optedOutAt)}</strong>.
              </p>
              {/*
                The way back is recipient-initiated, and six months on the
                exhibitor has deleted the thread — so the number has to be here
                or "reply START" is unusable advice.
              */}
              {sendingNumber ? (
                <p>
                  To turn them back on, text <strong>START</strong> to{' '}
                  <strong>{sendingNumber}</strong>.
                </p>
              ) : (
                <p>
                  To turn them back on, reply <strong>START</strong> to any ring alert text, or
                  contact support@myk9show.com.
                </p>
              )}
              {stopMutedPush && (
                <p className="text-muted-foreground">
                  That also turned off push notifications for ring alerts. You can switch those
                  back on above whenever you like — they are not affected by the text opt-out.
                </p>
              )}
            </div>
          ) : (
          <div className="pl-6 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sms-phone">Mobile number</Label>
              <Input
                id="sms-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(210) 555-0142"
                value={phone}
                disabled={isLoading || isSmsSaving || smsLoadFailed}
                onChange={event => {
                  setPhone(event.target.value);
                  setConsentChecked(false);
                  setError(null);
                }}
                onBlur={handlePhoneBlur}
              />
            </div>

            {!hasValidConsent && !isLoading && !smsLoadFailed && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <label
                  htmlFor="sms-consent"
                  className="flex min-h-11 cursor-pointer items-start gap-3 text-sm"
                >
                  <Checkbox
                    id="sms-consent"
                    checked={consentChecked}
                    onCheckedChange={setConsentChecked}
                    className="mt-0.5"
                  />
                  <span>{SMS_CONSENT_TEXT}</span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11"
                  disabled={isSmsSaving}
                  onClick={handleSmsOptIn}
                >
                  Turn on text alerts
                </Button>
              </div>
            )}
          </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
