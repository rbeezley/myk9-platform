import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { NotificationPayload, NotificationPreferences } from '@myk9/notifications';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

export interface AlertEntry {
  payload: NotificationPayload;
  read: boolean;
}

interface NotificationState {
  preferences: NotificationPreferences;
  permissionStatus: NotificationPermission;
  isInRing: boolean;
  recentAlerts: AlertEntry[];
  unreadCount: number;
  isCenterOpen: boolean;

  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  requestPermission: () => Promise<void>;
  setInRing: (value: boolean) => void;
  addAlert: (payload: NotificationPayload) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissAlert: (id: string) => void;
  openCenter: () => void;
  closeCenter: () => void;
}

const MAX_RECENT_ALERTS = 50;

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
      isCenterOpen: false,

      updatePreferences: prefs =>
        set(state => {
          const updated = { ...state.preferences, ...prefs };
          if ('leadDogs' in prefs) {
            updated.leadDogs = clamp(updated.leadDogs, 1, 5);
          }
          if ('voiceRate' in prefs) {
            updated.voiceRate = clamp(updated.voiceRate, 0.5, 2.0);
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

      markRead: id =>
        set(state => {
          const updated = state.recentAlerts.map(a =>
            a.payload.id === id ? { ...a, read: true } : a
          );
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

      dismissAlert: id =>
        set(state => {
          const updated = state.recentAlerts.filter(a => a.payload.id !== id);
          return {
            recentAlerts: updated,
            unreadCount: updated.filter(a => !a.read).length,
          };
        }),

      openCenter: () => set({ isCenterOpen: true }),
      closeCenter: () => set({ isCenterOpen: false }),
    }),
    {
      name: 'myk9-notification-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        preferences: state.preferences,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<NotificationState> | undefined;
        if (!persistedState?.preferences) return current;

        const persisted_ = persistedState.preferences;
        const defaults = current.preferences;

        return {
          ...current,
          preferences: {
            ...defaults,
            ...Object.fromEntries(Object.entries(persisted_).filter(([, v]) => v !== undefined)),
            voiceCategories: {
              ...defaults.voiceCategories,
              ...(persisted_.voiceCategories ?? {}),
            },
          },
        };
      },
    }
  )
);
