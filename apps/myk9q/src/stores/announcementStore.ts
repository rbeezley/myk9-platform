import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { serviceWorkerManager } from '../utils/serviceWorkerUtils';
import { AnnouncementService } from '../services/announcementService';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';

export interface Announcement {
  id: number;
  license_key: string;
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
  author_role: 'admin' | 'judge' | 'steward';
  author_name?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  is_active: boolean;
  is_read?: boolean;
}

export interface AnnouncementRead {
  id: number;
  announcement_id: number;
  user_identifier: string;
  license_key: string;
  read_at: string;
}

interface AnnouncementFilters {
  priority?: 'normal' | 'high' | 'urgent';
  author_role?: 'admin' | 'judge' | 'steward';
  searchTerm?: string;
  showExpired?: boolean;
}

interface AnnouncementState {
  // Data
  announcements: Announcement[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  lastVisit: string | null;

  // Real-time
  realtimeChannel: RealtimeChannel | null;
  isConnected: boolean;

  // Filters
  filters: AnnouncementFilters;

  // Current context
  currentLicenseKey: string | null;
  currentShowName: string | null;
  isInitializing: boolean; // Lock to prevent concurrent initialization

  // Actions
  setLicenseKey: (licenseKey: string, showName?: string) => void;
  fetchAnnouncements: (licenseKey?: string, forceRefresh?: boolean) => Promise<void>;
  createAnnouncement: (announcement: Omit<Announcement, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateAnnouncement: (id: number, updates: Partial<Announcement>) => Promise<void>;
  deleteAnnouncement: (id: number) => Promise<void>;
  markAsRead: (announcementId: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;

  // Filters
  setFilters: (filters: Partial<AnnouncementFilters>) => void;
  clearFilters: () => void;

  // Real-time
  enableRealtime: (licenseKey: string) => Promise<void>;
  disableRealtime: () => Promise<void>;

  // Utility
  getFilteredAnnouncements: () => Announcement[];
  updateLastVisit: () => void;
  reset: () => void;
  cleanup: () => void; // NEW: Explicit cleanup for component unmount
}

// Generate user identifier for read tracking
const generateUserIdentifier = (): string => {
  return AnnouncementService.generateUserIdentifier();
};

/**
 * Helper to update push subscription when switching shows
 * Extracted to reduce nesting depth (DEBT-009)
 */
async function updatePushSubscriptionForShow(licenseKey: string): Promise<void> {
  // Check if notifications are enabled
  const settings = localStorage.getItem('myK9Q_settings');
  if (!settings) return;

  const parsed = JSON.parse(settings);
  if (!parsed.enableNotifications) return;

  // Get user role
  const authData = localStorage.getItem('myK9Q_auth');
  if (!authData) return;

  const { role } = JSON.parse(authData);

  // Dynamically import push service
  const { default: PushNotificationService } = await import('../services/pushNotificationService');

  // Only update if already subscribed
  const isSubscribed = await PushNotificationService.isSubscribed();
  if (!isSubscribed) return;

  // Get favorite armbands for this show
  const favoriteArmbands = getFavoriteArmbands(licenseKey);

  await PushNotificationService.subscribe(role, licenseKey, favoriteArmbands);
}

/**
 * Helper to parse favorite armbands from localStorage
 * Extracted to reduce nesting depth (DEBT-009)
 */
function getFavoriteArmbands(licenseKey: string): number[] {
  const favoritesKey = `dog_favorites_${licenseKey}`;
  const savedFavorites = localStorage.getItem(favoritesKey);
  if (!savedFavorites) return [];

  try {
    const parsed = JSON.parse(savedFavorites);
    if (Array.isArray(parsed) && parsed.every(id => typeof id === 'number')) {
      return parsed;
    }
  } catch {
    // Invalid JSON, return empty
  }

  return [];
}

export const useAnnouncementStore = create<AnnouncementState>()(
  devtools(
    (set, get) => ({
      // Initial state
      announcements: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      lastVisit: localStorage.getItem('announcements_last_visit'),
      realtimeChannel: null,
      isConnected: false,
      filters: {},
      currentLicenseKey: null,
      currentShowName: null,
      isInitializing: false,

      setLicenseKey: (licenseKey: string, showName?: string) => {
        const current = get();

// Guard: Don't refetch if license key hasn't changed
        if (current.currentLicenseKey === licenseKey) {
return;
        }

        // Guard: Don't allow concurrent calls
        if (current.isLoading) {
return;
        }

        // Guard: Prevent concurrent initialization
        if (current.isInitializing) {
return;
        }

        // Guard: If we have an active channel for this license, we're already set up
        if (current.realtimeChannel && current.isConnected) {
          // Check if the existing channel matches the requested license key
          if (current.realtimeChannel.topic.includes(licenseKey)) {
return;
          }
        }

// Set initialization lock AND license key synchronously to prevent race conditions
        set({
          isInitializing: true,
          currentLicenseKey: licenseKey,
          currentShowName: showName || null
        });

        // If switching to different license key, clean up
        if (current.currentLicenseKey && current.currentLicenseKey !== licenseKey) {
          current.disableRealtime();
          set({ announcements: [], unreadCount: 0 });
        }

        // Store in localStorage for persistence
        localStorage.setItem('current_show_license', licenseKey);
        if (showName) {
          localStorage.setItem('current_show_name', showName);
        }

        // Update service worker with license key for tenant isolation
        serviceWorkerManager.updateLicenseKey(licenseKey);

        // Auto-update push subscription if notifications are enabled
        updatePushSubscriptionForShow(licenseKey).catch(error => {
          logger.error('[Push Auto-Switch] Failed to update subscription:', error);
        });

        // Auto-fetch announcements for new license
        Promise.all([
          get().fetchAnnouncements(licenseKey),
          get().enableRealtime(licenseKey)
        ]).finally(() => {
          // Clear initialization lock after both operations complete
          set({ isInitializing: false });
        });
      },

      fetchAnnouncements: async (licenseKey?: string, _forceRefresh = false) => {
        const targetLicenseKey = licenseKey || get().currentLicenseKey;
        if (!targetLicenseKey) {
          set({ error: 'No license key provided' });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const userIdentifier = generateUserIdentifier();

          // Use AnnouncementService which reads from IndexedDB
          const { data: announcementsWithReadStatus } = await AnnouncementService.getAnnouncementsWithReadStatus(
            targetLicenseKey,
            userIdentifier,
            {} // No filters at store level
          );

          // Calculate unread count (excluding expired announcements)
          const now = new Date();
          const unreadCount = announcementsWithReadStatus.filter(a => {
            if (a.is_read) return false;
            // Exclude expired announcements from count
            if (a.expires_at && new Date(a.expires_at) < now) return false;
            return true;
          }).length;

          set({
            announcements: announcementsWithReadStatus,
            unreadCount,
            isLoading: false
          });

        } catch (error) {
          logger.error('Error fetching announcements:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch announcements',
            isLoading: false
          });
        }
      },

      createAnnouncement: async (announcement) => {
        const { currentLicenseKey } = get();
        if (!currentLicenseKey) {
          throw new Error('No license key set');
        }

        try {
          // 🚀 OFFLINE-FIRST: Use AnnouncementService which handles:
          // 1. Database write
          // 2. Immediate cache sync (our fix)
          // 3. Real-time subscription triggers
          const data = await AnnouncementService.createAnnouncement({
            title: announcement.title,
            content: announcement.content,
            priority: announcement.priority,
            author_role: announcement.author_role,
            author_name: announcement.author_name,
            expires_at: announcement.expires_at,
            license_key: currentLicenseKey
          });

          // Add to local state
          set(state => ({
            announcements: [{ ...data, is_read: false }, ...state.announcements],
            unreadCount: state.unreadCount + 1
          }));

          // Push notification is handled by database trigger (Migration 019) + Edge Function in production
          // This client-side fallback provides graceful degradation if Edge Function fails
          // Note: Edge Function send-push-notification is deployed and active (v16)
          if ('serviceWorker' in navigator) {
// Add timeout to service worker ready promise
            const swReadyTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Service worker ready timeout')), 5000)
            );

            Promise.race([navigator.serviceWorker.ready, swReadyTimeout])
              .then((registration) => {
                const swRegistration = registration as ServiceWorkerRegistration;

                if (!swRegistration.active) {
                  logger.error('❌ Service worker is not active');
                  // Fallback: Show browser notification directly
                  if ('Notification' in window && Notification.permission === 'granted') {
new Notification(data.title, {
                      body: data.content,
                      icon: '/myK9Q-teal-192.png',
                      badge: '/myK9Q-teal-192.png',
                    });
                  }
                  return;
                }

                swRegistration.active.postMessage({
                  type: 'SIMULATE_PUSH',
                  data: {
                    id: data.id,
                    licenseKey: data.license_key,
                    title: data.title,
                    content: data.content,
                    priority: data.priority,
                    showName: localStorage.getItem('current_show_name') || 'myK9Q Show',
                    timestamp: new Date().toISOString()
                  }
                });
})
              .catch(error => {
                logger.error('❌ Service worker not ready:', error.message);
                // Fallback: Show browser notification directly
                if ('Notification' in window && Notification.permission === 'granted') {
const isUrgent = data.priority === 'urgent';
                  const title = isUrgent ? `🚨 ${data.title}` : data.title;
                  new Notification(title, {
                    body: data.content,
                    icon: '/myK9Q-teal-192.png',
                    badge: '/myK9Q-teal-192.png',
                    requireInteraction: isUrgent,
                  });
                } else {
                  logger.error('❌ Cannot show notification - permission not granted');
                }
              });
          }

        } catch (error) {
          logger.error('Error creating announcement:', error);
          throw error;
        }
      },

      updateAnnouncement: async (id, updates) => {
        const { currentLicenseKey } = get();
        if (!currentLicenseKey) {
          throw new Error('No license key set');
        }

        // Get current user role from localStorage
        const authData = localStorage.getItem('myK9Q_auth');
        if (!authData) {
          throw new Error('Not authenticated');
        }
        const { role } = JSON.parse(authData);

        try {
          // 🚀 OFFLINE-FIRST: Use AnnouncementService which handles immediate cache sync
          const data = await AnnouncementService.updateAnnouncement(
            id,
            updates,
            currentLicenseKey,
            role
          );

          // Update local state
          set(state => ({
            announcements: state.announcements.map(a =>
              a.id === id ? { ...a, ...data } : a
            )
          }));

        } catch (error) {
          logger.error('Error updating announcement:', error);
          throw error;
        }
      },

      deleteAnnouncement: async (id) => {
        const { currentLicenseKey } = get();
        if (!currentLicenseKey) {
          throw new Error('No license key set');
        }

        // Get current user role from localStorage
        const authData = localStorage.getItem('myK9Q_auth');
        if (!authData) {
          throw new Error('Not authenticated');
        }
        const { role } = JSON.parse(authData);

        try {
          // 🚀 OFFLINE-FIRST: Use AnnouncementService which handles immediate cache sync
          await AnnouncementService.deleteAnnouncement(id, currentLicenseKey, role);

          // Remove from local state
          set(state => ({
            announcements: state.announcements.filter(a => a.id !== id),
            unreadCount: state.announcements.find(a => a.id === id && !a.is_read)
              ? state.unreadCount - 1
              : state.unreadCount
          }));

        } catch (error) {
          logger.error('Error deleting announcement:', error);
          throw error;
        }
      },

      markAsRead: async (announcementId) => {
        const { currentLicenseKey } = get();
        if (!currentLicenseKey) return;

        const userIdentifier = generateUserIdentifier();

        try {
          // Use AnnouncementService (still writes to Supabase)
          await AnnouncementService.markAsRead(announcementId, currentLicenseKey, userIdentifier);

          // Update local state
          set(state => {
            const announcement = state.announcements.find(a => a.id === announcementId);
            if (announcement && !announcement.is_read) {
              return {
                announcements: state.announcements.map(a =>
                  a.id === announcementId ? { ...a, is_read: true } : a
                ),
                unreadCount: Math.max(0, state.unreadCount - 1)
              };
            }
            return state;
          });

        } catch (error) {
          logger.error('Error marking announcement as read:', error);
        }
      },

      markAllAsRead: async () => {
        const { currentLicenseKey, announcements } = get();
        if (!currentLicenseKey) return;

        const userIdentifier = generateUserIdentifier();
        const unreadAnnouncements = announcements.filter(a => !a.is_read);

        if (unreadAnnouncements.length === 0) return;

        try {
          const announcementIds = unreadAnnouncements.map(a => a.id);

          // Use AnnouncementService (still writes to Supabase)
          await AnnouncementService.markMultipleAsRead(announcementIds, currentLicenseKey, userIdentifier);

          // Update local state
          set(state => ({
            announcements: state.announcements.map(a => ({ ...a, is_read: true })),
            unreadCount: 0
          }));

        } catch (error) {
          logger.error('Error marking all announcements as read:', error);
        }
      },

      setFilters: (newFilters) => {
        set(state => ({
          filters: { ...state.filters, ...newFilters }
        }));
      },

      clearFilters: () => {
        set({ filters: {} });
      },

      enableRealtime: async (licenseKey) => {
        const { realtimeChannel } = get();

        // Don't create duplicate channels
        if (realtimeChannel) {
          await get().disableRealtime();
        }

        try {
          const channel = supabase.channel(`announcements-${licenseKey}`);

          // Listen for new announcements
          channel
            .on('postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'announcements',
                filter: `license_key=eq.${licenseKey}`
              },
              (payload) => {
const newAnnouncement: Announcement = { ...(payload.new as Announcement), is_read: false };

                set(state => ({
                  announcements: [newAnnouncement, ...state.announcements],
                  unreadCount: state.unreadCount + 1
                }));

                // Push notification is handled by database trigger (Migration 019)
                // Real-time subscription only updates UI state
              }
            )
            .on('postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'announcements',
                filter: `license_key=eq.${licenseKey}`
              },
              (payload) => {
set(state => ({
                  announcements: state.announcements.map(a =>
                    a.id === payload.new.id ? { ...a, ...payload.new } : a
                  )
                }));
              }
            )
            .on('postgres_changes',
              {
                event: 'DELETE',
                schema: 'public',
                table: 'announcements',
                filter: `license_key=eq.${licenseKey}`
              },
              (payload) => {
set(state => ({
                  announcements: state.announcements.filter(a => a.id !== payload.old.id),
                  unreadCount: state.announcements.find(a => a.id === payload.old.id && !a.is_read)
                    ? state.unreadCount - 1
                    : state.unreadCount
                }));
              }
            );

          await channel.subscribe();

          set({
            realtimeChannel: channel,
            isConnected: true
          });

} catch (error) {
          logger.error('Failed to enable real-time updates:', error);
          set({ isConnected: false });
        }
      },

      disableRealtime: async () => {
        const { realtimeChannel } = get();

        if (realtimeChannel) {
          await supabase.removeChannel(realtimeChannel);
          set({
            realtimeChannel: null,
            isConnected: false
          });
}
      },

      getFilteredAnnouncements: () => {
        const { announcements, filters } = get();

        return announcements.filter(announcement => {
          // Priority filter
          if (filters.priority && announcement.priority !== filters.priority) {
            return false;
          }

          // Author role filter
          if (filters.author_role && announcement.author_role !== filters.author_role) {
            return false;
          }

          // Search term filter
          if (filters.searchTerm) {
            const searchLower = filters.searchTerm.toLowerCase();
            if (
              !announcement.title.toLowerCase().includes(searchLower) &&
              !announcement.content.toLowerCase().includes(searchLower) &&
              !announcement.author_name?.toLowerCase().includes(searchLower)
            ) {
              return false;
            }
          }

          // Expired filter
          if (!filters.showExpired && announcement.expires_at) {
            const now = new Date();
            const expiresAt = new Date(announcement.expires_at);
            if (now > expiresAt) {
              return false;
            }
          }

          return true;
        });
      },

      updateLastVisit: () => {
        const now = new Date().toISOString();
        set({ lastVisit: now });
        localStorage.setItem('announcements_last_visit', now);
      },

      reset: () => {
        get().disableRealtime();
        set({
          announcements: [],
          unreadCount: 0,
          isLoading: false,
          error: null,
          lastVisit: null,
          realtimeChannel: null,
          isConnected: false,
          filters: {},
          currentLicenseKey: null,
          currentShowName: null
        });

        // Clear localStorage
        localStorage.removeItem('current_show_license');
        localStorage.removeItem('current_show_name');
        localStorage.removeItem('announcements_last_visit');
      },

      cleanup: () => {
        // Explicit cleanup method for component unmount
        // Only disables realtime, doesn't clear data (for navigation)
        const { realtimeChannel } = get();

        if (realtimeChannel) {
get().disableRealtime();
        }

        // Clear initialization lock if stuck
        if (get().isInitializing) {
set({ isInitializing: false });
        }
      }
    }),
    {
      name: 'announcement-store',
      enabled: import.meta.env.DEV
    }
  )
);