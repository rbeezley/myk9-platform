import { useNotificationStore } from '@/store/notificationStore';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { notifications } from '@/lib/notifications';
import { useState } from 'react';
import { testSound } from '@myk9/notifications';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Bell, Volume2, Mic, Smartphone, Send } from 'lucide-react';

const CHANNEL_TOGGLES = [
  { key: 'soundEnabled', label: 'Sound', desc: 'Play an alert tone', icon: Volume2 },
  { key: 'voiceEnabled', label: 'Voice announcements', desc: 'Read ring call aloud', icon: Mic },
  { key: 'vibrationEnabled', label: 'Vibration', desc: 'Vibrate on alert', icon: Smartphone },
] as const;

export function NotificationSettings() {
  const preferences = useNotificationStore(s => s.preferences);
  const permissionStatus = useNotificationStore(s => s.permissionStatus);
  const updatePreferences = useNotificationStore(s => s.updatePreferences);
  const { subscribe, unsubscribe, isSupported } = usePushSubscription();
  const [isPushLoading, setIsPushLoading] = useState(false);

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

  return (
    <div className="space-y-4">
      {/* General */}
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
                checked={preferences[key]}
                onCheckedChange={checked => updatePreferences({ [key]: checked })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Push */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">
                  <label htmlFor="push-enabled">Push notifications</label>
                </CardTitle>
                {permissionStatus === 'denied' && (
                  <p className="text-xs text-destructive">Blocked in browser settings</p>
                )}
                {!isSupported && (
                  <p className="text-xs text-muted-foreground">Not supported on this browser</p>
                )}
              </div>
            </div>
            <Switch
              id="push-enabled"
              checked={preferences.pushEnabled}
              disabled={!isSupported || isPushLoading}
              onCheckedChange={handlePushToggle}
            />
          </div>
        </CardHeader>
      </Card>

      <Button variant="outline" className="w-full" onClick={() => testSound('normal')}>
        Test notification
      </Button>
    </div>
  );
}
