import { useNotificationStore } from '@/store/notificationStore';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { notifications } from '@/lib/notifications';
import { testSound } from '@myk9/notifications';

export function NotificationSettings() {
  const preferences = useNotificationStore(s => s.preferences);
  const permissionStatus = useNotificationStore(s => s.permissionStatus);
  const updatePreferences = useNotificationStore(s => s.updatePreferences);

  const { subscribe, unsubscribe, isSupported } = usePushSubscription();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <label htmlFor="notif-enabled" className="font-medium">
          Enable notifications
        </label>
        <input
          id="notif-enabled"
          type="checkbox"
          role="switch"
          checked={preferences.enabled}
          onChange={e => updatePreferences({ enabled: e.target.checked })}
          className="h-5 w-5"
        />
      </div>

      <div>
        <label htmlFor="lead-dogs" className="block font-medium mb-1">
          Alert when this many dogs ahead: {preferences.leadDogs}
        </label>
        <input
          id="lead-dogs"
          type="range"
          min={1}
          max={5}
          value={preferences.leadDogs}
          onChange={e => updatePreferences({ leadDogs: Number(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1</span>
          <span>5</span>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-medium">Channels</legend>
        {(
          [
            ['soundEnabled', 'Sound'],
            ['voiceEnabled', 'Voice announcements'],
            ['vibrationEnabled', 'Vibration'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <label htmlFor={key}>{label}</label>
            <input
              id={key}
              type="checkbox"
              checked={preferences[key]}
              onChange={e => updatePreferences({ [key]: e.target.checked })}
              className="h-5 w-5"
            />
          </div>
        ))}
      </fieldset>

      <div className="flex items-center justify-between">
        <div>
          <label htmlFor="push-enabled" className="font-medium">
            Push notifications
          </label>
          {permissionStatus === 'denied' && (
            <p className="text-xs text-destructive">Blocked in browser settings</p>
          )}
          {!isSupported && (
            <p className="text-xs text-muted-foreground">Not supported on this browser</p>
          )}
        </div>
        <input
          id="push-enabled"
          type="checkbox"
          checked={preferences.pushEnabled}
          disabled={!isSupported}
          onChange={async e => {
            if (e.target.checked) {
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
          }}
          className="h-5 w-5"
        />
      </div>

      <button
        onClick={() => testSound('normal')}
        className="w-full rounded-md border px-4 py-2 text-sm hover:bg-muted"
      >
        Test notification
      </button>
    </div>
  );
}
