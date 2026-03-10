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

  it('limits recent alerts to 10', () => {
    for (let i = 0; i < 12; i++) {
      useNotificationStore.getState().addAlert(makePayload(`id-${i}`));
    }

    expect(useNotificationStore.getState().recentAlerts).toHaveLength(10);
    // Most recent should be first
    expect(useNotificationStore.getState().recentAlerts[0].payload.id).toBe('id-11');
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
});
