import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { NotificationPayload, NotificationPreferences } from '@myk9/notifications';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

interface AlertEntry {
  payload: NotificationPayload;
  read: boolean;
}

interface NotificationState {
  preferences: NotificationPreferences;
  permissionStatus: NotificationPermission;
  isInRing: boolean;
  recentAlerts: AlertEntry[];
  unreadCount: number;

  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  requestPermission: () => Promise<void>;
  setInRing: (value: boolean) => void;
  addAlert: (payload: NotificationPayload) => void;
  markAllRead: () => void;
}

const MAX_RECENT_ALERTS = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    set => ({
      preferences: { ...DEFAULT_PREFERENCES },
      permissionStatus: 'default' as NotificationPermission,
      isInRing: false,
      recentAlerts: [],
      unreadCount: 0,

      updatePreferences: prefs =>
        set(state => {
          const updated = { ...state.preferences, ...prefs };
          if ('leadDogs' in prefs) {
            updated.leadDogs = clamp(updated.leadDogs, 1, 5);
          }
          return { preferences: updated };
        }),

      requestPermission: async () => {
        if (typeof Notification === 'undefined') {
          set({ permissionStatus: 'denied' });
          return;
        }
        if (Notification.permission !== 'default') {
          set({ permissionStatus: Notification.permission });
          return;
        }
        const result = await Notification.requestPermission();
        set({ permissionStatus: result });
      },

      setInRing: value => set({ isInRing: value }),

      addAlert: payload =>
        set(state => {
          const entry: AlertEntry = { payload, read: false };
          const updated = [entry, ...state.recentAlerts].slice(0, MAX_RECENT_ALERTS);
          return {
            recentAlerts: updated,
            unreadCount: updated.filter(a => !a.read).length,
          };
        }),

      markAllRead: () =>
        set(state => ({
          recentAlerts: state.recentAlerts.map(a => ({ ...a, read: true })),
          unreadCount: 0,
        })),
    }),
    {
      name: 'myk9-notification-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        preferences: state.preferences,
      }),
    }
  )
);
