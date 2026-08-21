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
import { notifications } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

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
});

export function RingAlertsSettings() {
  const preferences = useNotificationStore(state => state.preferences);
  const permissionStatus = useNotificationStore(state => state.permissionStatus);
  const updatePreferences = useNotificationStore(state => state.updatePreferences);
  const { user } = useAuthContext();
  const { subscribe, unsubscribe, isSupported: isPushSupported } = usePushSubscription();
  const [smsPreference, setSmsPreference] = useState<SmsNotificationPreference | null>(null);
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
          updatePreferences({ enabled: row.upcoming_runs });
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

  async function handleRingAlertsToggle(checked: boolean) {
    const previous = preferences.enabled;
    updatePreferences({ enabled: checked });
    setError(null);
    if (!(await setRingAlertsEnabled(user?.id, checked))) {
      updatePreferences({ enabled: previous });
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
    const cleared = await clearSmsConsent(user?.id);
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
        upcoming_runs: preferences.enabled,
        sms_enabled: true,
        sms_phone_e164: result.phone,
        sms_opt_in_at: new Date().toISOString(),
        sms_consent_text_version: SMS_CONSENT_TEXT_VERSION,
        sms_opt_in_source: 'account-settings',
        sms_opt_out_at: null,
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
            checked={preferences.enabled}
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
            disabled={!preferences.enabled || !isPushSupported || isPushLoading}
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
            <Switch
              id="sms-enabled"
              checked={smsPreference?.sms_enabled === true}
              disabled={
                !preferences.enabled ||
                isLoading ||
                isSmsSaving ||
                smsLoadFailed ||
                !hasValidConsent
              }
              onCheckedChange={handleSmsToggle}
            />
          </div>

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
                <Button type="button" size="sm" disabled={isSmsSaving} onClick={handleSmsOptIn}>
                  Turn on text alerts
                </Button>
              </div>
            )}
          </div>
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
