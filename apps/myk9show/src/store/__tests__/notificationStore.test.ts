import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from '../notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

function makePayload(id: string): NotificationPayload {
  return {
    id,
    type: 'your_turn',
    title: 'Test',
    body: 'Test body',
    priority: 'urgent',
    timestamp: Date.now(),
  };
}

describe('notificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES },
      permissionStatus: 'default' as NotificationPermission,
      isInRing: false,
      recentAlerts: [],
      unreadCount: 0,
      isCenterOpen: false,
    });
  });

  it('initializes with default preferences', () => {
    const state = useNotificationStore.getState();
    expect(state.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(state.isInRing).toBe(false);
    expect(state.recentAlerts).toEqual([]);
  });

  it('updates preferences partially', () => {
    useNotificationStore.getState().updatePreferences({ leadDogs: 5 });
    const state = useNotificationStore.getState();
    expect(state.preferences.leadDogs).toBe(5);
    expect(state.preferences.enabled).toBe(true); // unchanged
  });

  it('clamps leadDogs to 1-5 range', () => {
    useNotificationStore.getState().updatePreferences({ leadDogs: 0 });
    expect(useNotificationStore.getState().preferences.leadDogs).toBe(1);

    useNotificationStore.getState().updatePreferences({ leadDogs: 10 });
    expect(useNotificationStore.getState().preferences.leadDogs).toBe(5);
  });

  it('sets isInRing', () => {
    useNotificationStore.getState().setInRing(true);
    expect(useNotificationStore.getState().isInRing).toBe(true);
  });

  it('adds alert to recent list as unread', () => {
    const payload = makePayload('1');
    useNotificationStore.getState().addAlert(payload);

    const alerts = useNotificationStore.getState().recentAlerts;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].payload).toEqual(payload);
    expect(alerts[0].read).toBe(false);
  });

  it('marks all alerts as read', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));

    useNotificationStore.getState().markAllRead();

    const alerts = useNotificationStore.getState().recentAlerts;
    expect(alerts.every(a => a.read)).toBe(true);
  });

  it('counts unread alerts', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));

    expect(useNotificationStore.getState().unreadCount).toBe(2);

    useNotificationStore.getState().markAllRead();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('limits recent alerts to 50', () => {
    for (let i = 0; i < 55; i++) {
      useNotificationStore.getState().addAlert(makePayload(`id-${i}`));
    }
    expect(useNotificationStore.getState().recentAlerts).toHaveLength(50);
    expect(useNotificationStore.getState().recentAlerts[0].payload.id).toBe('id-54');
  });

  it('markRead marks a single alert as read and recomputes unreadCount', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    expect(useNotificationStore.getState().unreadCount).toBe(2);

    useNotificationStore.getState().markRead('1');

    const state = useNotificationStore.getState();
    const alert1 = state.recentAlerts.find(a => a.payload.id === '1');
    expect(alert1?.read).toBe(true);
    expect(state.unreadCount).toBe(1);
  });

  it('markRead is a no-op for unknown ids', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().markRead('unknown');
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it('dismissAlert removes an alert from the list', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));

    useNotificationStore.getState().dismissAlert('1');

    const state = useNotificationStore.getState();
    expect(state.recentAlerts).toHaveLength(1);
    expect(state.recentAlerts[0].payload.id).toBe('2');
  });

  it('dismissAlert recomputes unreadCount', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    useNotificationStore.getState().markRead('1');
    expect(useNotificationStore.getState().unreadCount).toBe(1);

    useNotificationStore.getState().dismissAlert('2');
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('openCenter / closeCenter toggles isCenterOpen', () => {
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
    useNotificationStore.getState().openCenter();
    expect(useNotificationStore.getState().isCenterOpen).toBe(true);
    useNotificationStore.getState().closeCenter();
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  });
});
