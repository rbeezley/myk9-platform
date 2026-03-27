import { useState, useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSettingsStore } from '@/stores/settingsStore';

function hasSpeechSynthesis() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function ScoringSettings() {
  const voiceAnnouncements = useSettingsStore(s => s.settings.voiceAnnouncements);
  const voiceName = useSettingsStore(s => s.settings.voiceName);
  const voiceRate = useSettingsStore(s => s.settings.voiceRate);
  const updateSettings = useSettingsStore(s => s.updateSettings);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!hasSpeechSynthesis()) return;

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      setVoices(allVoices.filter(v => v.lang.startsWith('en')));
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const handleTestVoice = () => {
    if (!hasSpeechSynthesis()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('This is a test of your selected voice.');
    const selectedVoice = voices.find(v => v.name === voiceName);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = voiceRate;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Scoring</h2>
        <p className="text-sm text-muted-foreground">
          Voice announcements and audio during scoring
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Announcements
          </CardTitle>
          <CardDescription>Configure voice announcements for scoring sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Voice Announcements</Label>
              <div className="text-sm text-muted-foreground">
                Announce 30-second warning aloud during scoring
              </div>
            </div>
            <Switch
              checked={voiceAnnouncements}
              onCheckedChange={checked => updateSettings({ voiceAnnouncements: checked })}
            />
          </div>

          <Separator />

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Voice Configuration
            </Label>
          </div>

          <div className="space-y-1">
            <Label htmlFor="voice-select" className="font-medium">
              Voice
            </Label>
            <div className="text-sm text-muted-foreground mb-2">
              Select system voice for announcements
            </div>
            <select
              id="voice-select"
              aria-label="Voice"
              value={voiceName}
              onChange={e => updateSettings({ voiceName: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Browser Default</option>
              {voices.map(voice => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="font-medium">Speed</Label>
            <div className="text-sm text-muted-foreground mb-2">Speaking rate</div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">0.5x</span>
              <Slider
                value={[voiceRate]}
                onValueChange={([value]) => updateSettings({ voiceRate: value })}
                min={0.5}
                max={2.0}
                step={0.1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">2x</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleTestVoice}
            disabled={!hasSpeechSynthesis()}
          >
            <Volume2 className="h-4 w-4 mr-2" />
            Test Voice
          </Button>

          {!hasSpeechSynthesis() && (
            <p className="text-xs text-muted-foreground mt-2">
              Voice features are not available in this browser.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
