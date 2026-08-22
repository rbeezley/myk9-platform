import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { testSound, isSpeechSupported, speakWithConfig } from '@myk9/notifications';
import type { VoiceCategories } from '@myk9/notifications';
import { groupVoices, detectPlatform, getEnhancedVoiceInstructions } from '@/lib/voice-utils';
import { useSettingsStore } from '@/store/settingsStore';
import { useHapticFeedback } from '@myk9/scoring-ui';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Volume2, Smartphone, Vibrate, Mic, RefreshCw } from 'lucide-react';
import { RingAlertsSettings } from './RingAlertsSettings';

const ALWAYS_ENABLED = () => true;

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
  { key: 'announcements', label: 'Announcements', example: 'Secretary messages (high/urgent)' },
];

export function NotificationSettings() {
  const preferences = useNotificationStore(s => s.preferences);
  const updatePreferences = useNotificationStore(s => s.updatePreferences);
  const hapticFeedback = useSettingsStore(s => s.settings.hapticFeedback);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const haptic = useHapticFeedback(ALWAYS_ENABLED);

  const handleHapticToggle = (checked: boolean) => {
    updateSettings({ hapticFeedback: checked });
    if (checked && haptic.isSupported) {
      haptic.light();
    }
  };
  const [voiceRateDisplay, setVoiceRateDisplay] = useState(preferences.voiceRate);
  const voiceRateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep local display value in sync when preferences change from outside
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external Zustand updates must refresh the local debounced display value
    setVoiceRateDisplay(preferences.voiceRate);
  }, [preferences.voiceRate]);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const speechSupported = isSpeechSupported();

  const loadVoices = useCallback(() => {
    if (!speechSupported) return;
    const allVoices = speechSynthesis.getVoices();
    setVoices(allVoices.filter(v => v.lang.startsWith('en')));
  }, [speechSupported]);

  useEffect(() => {
    if (!speechSupported) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser voices are an external system and require an initial snapshot
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [speechSupported, loadVoices]);

  const grouped = useMemo(() => groupVoices(voices), [voices]);
  const showNudge = speechSupported && voices.length > 0 && grouped.recommended.length === 0;
  const instructions = useMemo(() => {
    if (typeof navigator === 'undefined') return null;
    const platform = detectPlatform(navigator.userAgent);
    return getEnhancedVoiceInstructions(platform);
  }, []);

  function handleTestVoice() {
    if (!speechSupported) return;
    speakWithConfig('This is a test of your selected voice.', {
      voiceName: preferences.voiceName,
      voiceRate: preferences.voiceRate,
    });
  }

  function updateVoiceCategory(key: keyof VoiceCategories, value: boolean) {
    const current = useNotificationStore.getState().preferences.voiceCategories;
    updatePreferences({
      voiceCategories: { ...current, [key]: value },
    });
  }

  return (
    <div className="space-y-4">
      <RingAlertsSettings />

      {/* Channels */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">On-device alerts</CardTitle>
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

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Vibrate className="h-4 w-4 text-muted-foreground" />
              <div>
                <label htmlFor="haptic-feedback" className="text-sm font-medium">
                  Haptic Feedback
                </label>
                <p className="text-xs text-muted-foreground">
                  Vibrate on touch interactions (mobile)
                </p>
              </div>
            </div>
            <Switch
              id="haptic-feedback"
              aria-label="Haptic Feedback"
              checked={hapticFeedback}
              onCheckedChange={handleHapticToggle}
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
                  <p className="text-sm font-semibold text-warning ">
                    Want better-sounding voices?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your device has free high-quality voices you can download. They sound much more
                    natural than the default.
                  </p>
                  <div className="rounded-md bg-background/80 p-3">
                    <p className="text-xs font-semibold text-warning uppercase tracking-wide mb-2">
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
                    value={[voiceRateDisplay]}
                    onValueChange={vals => {
                      setVoiceRateDisplay(vals[0]);
                      clearTimeout(voiceRateTimer.current);
                      voiceRateTimer.current = setTimeout(
                        () => updatePreferences({ voiceRate: vals[0] }),
                        300
                      );
                    }}
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
