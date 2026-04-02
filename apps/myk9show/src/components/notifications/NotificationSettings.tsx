import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { notifications } from '@/lib/notifications';
import { testSound, isSpeechSupported, speakWithConfig } from '@myk9/notifications';
import type { VoiceCategories } from '@myk9/notifications';
import { groupVoices, detectPlatform, getEnhancedVoiceInstructions } from '@/lib/voice-utils';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Bell, Volume2, Smartphone, Send, Mic, RefreshCw } from 'lucide-react';

const CHANNEL_TOGGLES = [
  { key: 'soundEnabled', label: 'Sound', desc: 'Play an alert tone', icon: Volume2 },
  { key: 'vibrationEnabled', label: 'Vibration', desc: 'Vibrate on alert', icon: Smartphone },
] as const;

const VOICE_CATEGORIES: Array<{
  key: keyof VoiceCategories;
  label: string;
  example: string;
}> = [
  { key: 'runOrder', label: 'Run order alerts', example: '"Max, number 42, you\'re up next"' },
  { key: 'results', label: 'Results posted', example: '"Bella, second place, qualified"' },
  { key: 'classStarting', label: 'Class starting', example: '"Novice A starting soon"' },
  { key: 'announcements', label: 'Announcements', example: 'Secretary broadcasts (high/urgent)' },
];

export function NotificationSettings() {
  const preferences = useNotificationStore(s => s.preferences);
  const permissionStatus = useNotificationStore(s => s.permissionStatus);
  const updatePreferences = useNotificationStore(s => s.updatePreferences);
  const { subscribe, unsubscribe, isSupported: isPushSupported } = usePushSubscription();
  const [isPushLoading, setIsPushLoading] = useState(false);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const speechSupported = isSpeechSupported();

  const loadVoices = useCallback(() => {
    if (!speechSupported) return;
    const allVoices = speechSynthesis.getVoices();
    setVoices(allVoices.filter(v => v.lang.startsWith('en')));
  }, [speechSupported]);

  useEffect(() => {
    if (!speechSupported) return;
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [speechSupported, loadVoices]);

  const grouped = useMemo(() => groupVoices(voices), [voices]);
  const showNudge = speechSupported && voices.length > 0 && grouped.recommended.length === 0;
  const instructions = useMemo(() => {
    const platform = detectPlatform(navigator.userAgent);
    return getEnhancedVoiceInstructions(platform);
  }, []);

  async function handlePushToggle(checked: boolean) {
    setIsPushLoading(true);
    try {
      if (checked) {
        const result = await subscribe();
        if (!result.ok) {
          if (result.reason === 'permission-denied') {
            notifications.warning('Push notifications blocked. Check browser settings.');
          } else {
            notifications.error('Failed to enable push notifications.');
          }
        }
      } else {
        const result = await unsubscribe();
        if (!result.ok) {
          notifications.error('Failed to disable push notifications.');
        }
      }
    } finally {
      setIsPushLoading(false);
    }
  }

  function handleTestVoice() {
    if (!speechSupported) return;
    speakWithConfig('This is a test of your selected voice.', {
      voiceName: preferences.voiceName,
      voiceRate: preferences.voiceRate,
    });
  }

  function updateVoiceCategory(key: keyof VoiceCategories, value: boolean) {
    updatePreferences({
      voiceCategories: { ...preferences.voiceCategories, [key]: value },
    });
  }

  return (
    <div className="space-y-4">
      {/* Enable notifications */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">
                  <label htmlFor="notif-enabled">Enable notifications</label>
                </CardTitle>
                <CardDescription className="text-xs">
                  Receive ring-call and scheduling alerts
                </CardDescription>
              </div>
            </div>
            <Switch
              id="notif-enabled"
              checked={preferences.enabled}
              onCheckedChange={checked => updatePreferences({ enabled: checked })}
            />
          </div>
        </CardHeader>
        <CardContent>
          <label htmlFor="lead-dogs" className="block text-sm font-medium mb-2">
            Alert when this many dogs ahead: {preferences.leadDogs}
          </label>
          <Slider
            id="lead-dogs"
            min={1}
            max={5}
            step={1}
            value={[preferences.leadDogs]}
            onValueChange={([v]) => updatePreferences({ leadDogs: v })}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1</span>
            <span>5</span>
          </div>
        </CardContent>
      </Card>

      {/* Channels */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNEL_TOGGLES.map(({ key, label, desc, icon: Icon }) => (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <label htmlFor={key} className="text-sm font-medium">
                    {label}
                  </label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
              <Switch
                id={key}
                aria-label={label}
                checked={preferences[key]}
                onCheckedChange={checked => updatePreferences({ [key]: checked })}
              />
            </div>
          ))}

          <Separator />

          {/* Push — now inline as a channel */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 flex-1 mr-3">
              <Send className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <label htmlFor="push-enabled" className="text-sm font-medium">
                  Push notifications
                </label>
                <p className="text-xs text-muted-foreground">
                  Receive alerts even when the app isn't open. Notifications appear on your lock
                  screen and in your notification center, just like texts or email.
                </p>
                {permissionStatus === 'denied' && (
                  <p className="text-xs text-destructive mt-1">Blocked in browser settings</p>
                )}
                {!isPushSupported && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Not supported on this browser
                  </p>
                )}
              </div>
            </div>
            <Switch
              id="push-enabled"
              checked={preferences.pushEnabled}
              disabled={!isPushSupported || isPushLoading}
              onCheckedChange={handlePushToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Voice Announcements */}
      {speechSupported && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">
                    <label htmlFor="voice-enabled">Voice Announcements</label>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Read notifications aloud using text-to-speech
                  </CardDescription>
                </div>
              </div>
              <Switch
                id="voice-enabled"
                checked={preferences.voiceEnabled}
                onCheckedChange={checked => updatePreferences({ voiceEnabled: checked })}
              />
            </div>
          </CardHeader>

          {preferences.voiceEnabled && (
            <CardContent className="space-y-4">
              {/* Per-category toggles */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Announce
                </Label>
              </div>
              {VOICE_CATEGORIES.map(({ key, label, example }) => (
                <div key={key} className="flex items-center justify-between pl-2">
                  <div>
                    <label htmlFor={`voice-cat-${key}`} className="text-sm font-medium">
                      {label}
                    </label>
                    <p className="text-xs text-muted-foreground">{example}</p>
                  </div>
                  <Switch
                    id={`voice-cat-${key}`}
                    aria-label={label}
                    checked={preferences.voiceCategories[key]}
                    onCheckedChange={checked => updateVoiceCategory(key, checked)}
                  />
                </div>
              ))}

              <Separator />

              {/* Voice config */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Voice
                </Label>
              </div>

              <div className="space-y-1">
                <Label htmlFor="voice-select" className="font-medium">
                  Voice
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select system voice for announcements
                </p>
                <select
                  id="voice-select"
                  aria-label="Voice"
                  value={preferences.voiceName}
                  onChange={e => updatePreferences({ voiceName: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Browser Default</option>
                  {grouped.recommended.length > 0 && (
                    <optgroup label="Recommended">
                      {grouped.recommended.map(voice => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {grouped.other.length > 0 && (
                    <optgroup label={grouped.recommended.length > 0 ? 'Other' : 'Available'}>
                      {grouped.other.map(voice => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Enhanced voice nudge */}
              {showNudge && instructions && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    Want better-sounding voices?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your device has free high-quality voices you can download. They sound much more
                    natural than the default.
                  </p>
                  <div className="rounded-md bg-background/80 p-3">
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">
                      {instructions.platform}
                    </p>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      {instructions.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadVoices}>
                    <RefreshCw className="h-3 w-3 mr-2" />
                    Check for new voices
                  </Button>
                </div>
              )}

              <div className="space-y-1">
                <Label className="font-medium">Speed</Label>
                <p className="text-xs text-muted-foreground mb-2">Speaking rate</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">0.5x</span>
                  <Slider
                    value={[preferences.voiceRate]}
                    onValueCommit={([value]) => updatePreferences({ voiceRate: value })}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground">2x</span>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={handleTestVoice}>
                <Volume2 className="h-4 w-4 mr-2" />
                Test Voice
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      <Button variant="outline" className="w-full" onClick={() => testSound('normal')}>
        Test notification
      </Button>
    </div>
  );
}
