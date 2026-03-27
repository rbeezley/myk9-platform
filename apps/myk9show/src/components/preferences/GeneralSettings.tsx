// apps/myk9show/src/components/preferences/GeneralSettings.tsx
import { Vibrate } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSettingsStore } from '@/stores/settingsStore';
import { useHapticFeedback } from '@myk9/scoring-ui';

export function GeneralSettings() {
  const hapticFeedback = useSettingsStore(s => s.settings.hapticFeedback);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const haptic = useHapticFeedback(() => true);

  const handleHapticToggle = (checked: boolean) => {
    updateSettings({ hapticFeedback: checked });
    if (checked && haptic.isSupported) {
      haptic.light();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">App behavior and interaction preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vibrate className="h-5 w-5" />
            Interaction
          </CardTitle>
          <CardDescription>Control how the app responds to your actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Haptic Feedback</Label>
              <div className="text-sm text-muted-foreground">
                Vibrate on touch interactions (mobile)
              </div>
            </div>
            <Switch checked={hapticFeedback} onCheckedChange={handleHapticToggle} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
