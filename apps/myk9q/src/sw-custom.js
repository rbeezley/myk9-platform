// Custom Service Worker for Push Notifications
// This uses injectManifest strategy to combine custom logic with Workbox precaching
// Workbox is bundled locally via npm packages (no external CDN dependency)

import { precacheAndRoute, matchPrecache } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Detect development mode (localhost or 127.0.0.1 with Vite's default port)
const isDevelopment = self.location.hostname === 'localhost' ||
                      self.location.hostname === '127.0.0.1' ||
                      self.location.port === '5173';

// Precache manifest - Vite PWA will inject this during build
// Skip in development to avoid caching stale dev server files
const precacheManifest = self.__WB_MANIFEST || [];
if (precacheManifest.length > 0 && !isDevelopment) {
  precacheAndRoute(precacheManifest);
}

// ========================================
// OFFLINE NAVIGATION & CACHING STRATEGIES
// ========================================

// JS caching strategy:
// - Development: NetworkFirst to always get fresh code from Vite dev server
// - Production: CacheFirst for offline support
registerRoute(
  ({ request, url }) => {
    // Match JS files from our origin
    return (
      url.origin === self.location.origin &&
      request.destination === 'script'
    );
  },
  isDevelopment
    ? new NetworkFirst({
        cacheName: 'js-cache-dev',
        plugins: [
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
        networkTimeoutSeconds: 5, // Fall back to cache only if network is slow
      })
    : new CacheFirst({
        cacheName: 'js-cache',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          }),
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
      })
);

// CacheFirst strategy for CSS - matches JS strategy to prevent FOUC (Flash of Unstyled Content)
// Vite generates content-hashed filenames (e.g., index-abc123.css), so different versions
// have different URLs - no risk of serving stale CSS with new JS.
// CRITICAL: Using NetworkFirst caused a race condition where JS rendered before CSS loaded,
// resulting in gray text, wrong alignment, and incorrect backgrounds on initial page load.
registerRoute(
  ({ request, url }) => {
    // Match CSS files from our origin
    return (
      url.origin === self.location.origin &&
      request.destination === 'style'
    );
  },
  isDevelopment
    ? new NetworkFirst({
        cacheName: 'css-cache-dev',
        plugins: [
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
        networkTimeoutSeconds: 5,
      })
    : new CacheFirst({
        cacheName: 'css-cache',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days (same as JS)
          }),
          new CacheableResponsePlugin({
            statuses: [0, 200],
          }),
        ],
      })
);

// Navigation requests: Try cache first, fall back to index.html for SPA routing
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ event }) => {
    try {
      // Try network first for navigation
      const networkResponse = await fetch(event.request);
      return networkResponse;
    } catch (error) {
      // If network fails, return cached index.html (SPA fallback)
      const cache = await caches.open('navigation-cache');
      const cachedResponse = await cache.match('/index.html');
      if (cachedResponse) {
        console.log('📱 [SW] Serving cached index.html for offline navigation');
        return cachedResponse;
      }
      // Last resort: try precache
      return matchPrecache('/index.html');
    }
  }
);

// Cache index.html on first load
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('navigation-cache').then((cache) => {
      return cache.add('/index.html');
    })
  );
});

// Get current license key from localStorage or session
const getCurrentLicenseKey = async () => {
  // Try to get from various possible storage locations
  const keys = [
    'current_show_license',
    'auth_license_key',
    'licenseKey'
  ];

  for (const key of keys) {
    const value = await getFromStorage(key);
    if (value) return value;
  }

  return null;
};

// Helper to get data from storage (works in service worker)
const getFromStorage = async (key) => {
  return new Promise((resolve) => {
    // Service workers can't access localStorage directly
    // We'll need to communicate with the main thread
    resolve(null);
  });
};

// Push notification handler
self.addEventListener('push', (event) => {
  event.waitUntil(handlePushNotification(event));

  // Forward push notification to all open clients for notification center
  event.waitUntil(
    (async () => {
      try {
        const data = event.data ? event.data.json() : null;
        if (!data) return;

        // Get all active window clients
        const clientList = await clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

        // Forward to each open client
        clientList.forEach(client => {
          client.postMessage({
            type: 'PUSH_RECEIVED',
            data: data
          });
        });

        console.log('📤 [ServiceWorker] Push notification forwarded to', clientList.length, 'clients');
      } catch (error) {
        console.error('❌ [ServiceWorker] Failed to forward push notification:', error);
      }
    })()
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Notification clicked:', event.notification.data, 'Action:', event.action);

  event.notification.close();

  // Handle different action types
  if (event.action === 'dismiss') {
    // If summary notification dismissed, close all grouped notifications
    if (event.notification.data?.isSummary) {
      event.waitUntil(
        self.registration.getNotifications().then(notifications => {
          const licenseKey = event.notification.data.licenseKey;
          notifications.forEach(n => {
            if (n.data?.licenseKey === licenseKey && !n.data?.isUrgent && !n.data?.isDogAlert) {
              n.close();
            }
          });
        })
      );
    }
    return; // Just close the notification
  }

  if (event.action === 'acknowledge') {
    // User acknowledged urgent alert - just close without opening app
    console.log('✓ User acknowledged urgent notification');
    return;
  }

  // Determine URL based on action and notification data
  let urlToOpen = '/announcements'; // Default
  const notifData = event.notification.data || {};

  if (event.action === 'view-class' && notifData.classId) {
    // Navigate to entry list (running order for the class)
    urlToOpen = `/class/${notifData.classId}/entries`;
  } else if (event.action === 'view' || !event.action) {
    // Default view action - use custom URL or announcements
    const rawUrl = notifData.url || '/announcements';

    // Fix malformed URLs from legacy database triggers
    // Invalid: /entries, /entries/{id}, /classes/{id}
    // Valid: /class/{classId}/entries
    if (notifData.classId && (rawUrl === '/entries' || rawUrl.startsWith('/entries/') || rawUrl.match(/^\/classes\/\d+/))) {
      console.log(`🔧 [SW] Fixing malformed URL: ${rawUrl} → /class/${notifData.classId}/entries`);
      urlToOpen = `/class/${notifData.classId}/entries`;
    } else {
      urlToOpen = rawUrl;
    }
  }

  // If summary notification clicked, close all grouped notifications and navigate
  if (event.notification.data?.isSummary) {
    event.waitUntil(
      self.registration.getNotifications().then(notifications => {
        const licenseKey = event.notification.data.licenseKey;
        notifications.forEach(n => {
          if (n.data?.licenseKey === licenseKey && !n.data?.isUrgent && !n.data?.isDogAlert) {
            n.close();
          }
        });

        // Then open the app
        return clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((clientList) => {
            // If app is already open, focus it and navigate
            for (const client of clientList) {
              if (client.url.includes(self.location.origin)) {
                client.focus();
                client.postMessage({
                  type: 'NOTIFICATION_CLICK',
                  url: urlToOpen,
                  data: event.notification.data
                });
                return;
              }
            }

            // If no existing window, open new one
            return clients.openWindow(urlToOpen);
          });
      })
    );
  } else {
    // Individual notification clicked
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // If app is already open, focus it and navigate
          for (const client of clientList) {
            if (client.url.includes(self.location.origin)) {
              client.focus();
              client.postMessage({
                type: 'NOTIFICATION_CLICK',
                url: urlToOpen,
                data: event.notification.data
              });
              return;
            }
          }

          // If no existing window, open new one
          return clients.openWindow(urlToOpen);
        })
    );
  }
});

// Listen for messages from main thread (for tenant isolation)
self.addEventListener('message', (event) => {
  console.log('📬 [ServiceWorker] Message received:', event.data?.type);

  if (event.data && event.data.type === 'UPDATE_LICENSE_KEY') {
    // Store license key for tenant isolation
    self.currentLicenseKey = event.data.licenseKey;
    console.log('🔑 Service worker updated license key:', event.data.licenseKey);
  }

  // Handle simulated push notifications (for development)
  if (event.data && event.data.type === 'SIMULATE_PUSH') {
    console.log('🧪 Simulated push notification received:', event.data.data);

    // Create a simulated push event
    const simulatedEvent = {
      data: {
        json: () => event.data.data,
        text: () => JSON.stringify(event.data.data)
      },
      waitUntil: (promise) => promise
    };

    // Process the simulated push notification
    handlePushNotification(simulatedEvent);

    // Forward to all open clients for notification center
    (async () => {
      try {
        const clientList = await clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

        clientList.forEach(client => {
          client.postMessage({
            type: 'PUSH_RECEIVED',
            data: event.data.data
          });
        });

        console.log('📤 [ServiceWorker] Simulated push forwarded to', clientList.length, 'clients');
      } catch (error) {
        console.error('❌ [ServiceWorker] Failed to forward simulated push:', error);
      }
    })();
  }
});

// Helper function to update notification summary
async function updateNotificationSummary(licenseKey, showName) {
  try {
    // Get all current notifications
    const allNotifications = await self.registration.getNotifications();

    // Count grouped (non-urgent, non-dog) notifications for this show
    const groupedNotifications = allNotifications.filter(n =>
      n.data?.licenseKey === licenseKey &&
      !n.data?.isUrgent &&
      !n.data?.isDogAlert &&
      !n.data?.isSummary
    );

    const count = groupedNotifications.length;

    // Only show summary if we have 2+ grouped notifications
    if (count >= 2) {
      console.log(`📊 Showing summary notification for ${count} grouped alerts`);

      await self.registration.showNotification(
        `${showName || 'myK9Q'} - ${count} updates`,
        {
          body: `Tap to view all announcements`,
          icon: '/myK9Q-teal-192.png',
          badge: '/notification-badge.png',
          tag: `show-${licenseKey}-summary`,
          group: `show-${licenseKey}`,
          renotify: true,
          data: {
            url: '/announcements',
            licenseKey: licenseKey,
            isSummary: true
          }
        }
      );
    } else {
      // Remove summary if we're down to 1 or 0 grouped notifications
      const summaryNotifications = allNotifications.filter(n =>
        n.data?.isSummary && n.data?.licenseKey === licenseKey
      );
      summaryNotifications.forEach(n => n.close());
    }
  } catch (error) {
    console.error('Error updating notification summary:', error);
  }
}

// Extract push notification logic into a reusable function
async function handlePushNotification(event) {
  console.log('🔔 Processing push notification:', event.data?.text());

  if (!event.data) {
    console.warn('Push event received but no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('📨 Push data:', data);

    // Validate required fields (accept both camelCase and snake_case from backend)
    const licenseKey = data.licenseKey || data.license_key;
    if (!licenseKey || !data.title) {
      console.warn('Invalid push data - missing required fields');
      return;
    }

    // Get current user's license key (tenant isolation)
    const currentLicense = self.currentLicenseKey;

    // Skip license check for test notifications (allows testing even if showContext isn't loaded)
    const isTestNotification = licenseKey === 'test' || (data.id && String(data.id).startsWith('test-'));

    // Only show notification if it's for the current show (or is a test notification)
    if (currentLicense && licenseKey !== currentLicense && !isTestNotification) {
      console.log('🚫 Push notification ignored - different show');
      return;
    }

    // Determine notification type and priority
    const isDogAlert = data.type === 'dog-alert' || data.type === 'up_soon' || data.type === 'come_to_gate' || data.dogId;
    // Dog alerts are always treated as urgent - missing your turn is critical!
    const isUrgent = data.priority === 'urgent' || isDogAlert;
    const isHigh = data.priority === 'high';

    // Smart grouping strategy:
    // - Urgent alerts: unique tag (no grouping, always visible)
    // - Dog alerts: unique tag (no grouping, important to user)
    // - Normal announcements: grouped by show (reduce clutter)
    const notificationTag = isUrgent || isDogAlert
      ? `${data.type || 'announcement'}-${licenseKey}-${data.id}`  // Unique = no grouping
      : `announcement-${licenseKey}-${data.id}`;  // Regular tag

    const notificationGroup = isUrgent || isDogAlert
      ? undefined  // No group = standalone notification
      : `show-${licenseKey}`;  // Grouped with other announcements

    // Build context-aware action buttons
    let actions = [];

    if (isDogAlert) {
      // Dog-specific actions: View class list to see position, Dismiss
      actions = [
        {
          action: 'view-class',
          title: '👁️ View Class',
          icon: '/myK9Q-teal-192.png'
        },
        {
          action: 'dismiss',
          title: '✕ Dismiss',
          icon: '/myK9Q-teal-192.png'
        }
      ];
    } else if (isUrgent) {
      // Urgent: View immediately, Acknowledge, Remind later
      actions = [
        {
          action: 'view',
          title: '👁️ View Now',
          icon: '/myK9Q-teal-192.png'
        },
        {
          action: 'acknowledge',
          title: '✓ Got It',
          icon: '/myK9Q-teal-192.png'
        }
      ];
    } else {
      // General announcements: View, Dismiss
      actions = [
        {
          action: 'view',
          title: '👁️ View',
          icon: '/myK9Q-teal-192.png'
        },
        {
          action: 'dismiss',
          title: '✕ Dismiss',
          icon: '/myK9Q-teal-192.png'
        }
      ];
    }

    const notificationOptions = {
      body: data.content || data.title,
      icon: '/myK9Q-teal-192.png',
      badge: '/notification-badge.png',
      tag: notificationTag,
      group: notificationGroup,  // Enables grouping on Android/Chrome
      requireInteraction: isUrgent, // Persistent for urgent
      renotify: !isUrgent && notificationGroup !== undefined, // Re-alert for grouped notifications
      silent: false,
      // More aggressive vibration patterns for better awareness
      // Urgent: Long attention-grabbing pattern (vibrate-pause-vibrate-pause-vibrate-pause-vibrate)
      // High: Strong double pulse
      // Normal: Noticeable triple pulse
      vibrate: isUrgent
        ? [300, 100, 300, 100, 300, 100, 300]  // 4 strong pulses for urgent
        : isHigh
          ? [250, 100, 250, 100, 250]  // 3 pulses for high priority
          : [150, 75, 150, 75, 150],   // 3 lighter pulses for normal
      data: {
        url: data.url || '/announcements',
        licenseKey: licenseKey,
        announcementId: data.id,
        priority: data.priority,
        isUrgent: isUrgent,
        isDogAlert: isDogAlert,
        dogId: data.dogId,
        dogName: data.dogName,
        classId: data.classId,
        entryId: data.entryId
      },
      actions: actions
    };

    // Customize title based on priority and show info
    let title = data.title || 'Show Update';

    // Add show name if available (but not if title already contains it)
    if (data.showName && !title.includes(data.showName)) {
      title = `${data.showName}: ${title}`;
    }

    // Add priority indicators
    if (isUrgent) {
      title = `🚨 ${title}`;
    } else if (isHigh) {
      title = `⚠️ ${title}`;
    } else if (isDogAlert) {
      title = `🐕 ${title}`;
    }

    console.log(`📬 Showing notification - Tag: ${notificationTag}, Group: ${notificationGroup || 'none'}`);
    await self.registration.showNotification(title, notificationOptions);

    // Update summary notification for grouped announcements
    if (notificationGroup && !isUrgent && !isDogAlert) {
      await updateNotificationSummary(licenseKey, data.showName);
    }

  } catch (error) {
    console.error('Error handling push notification:', error);
  }
}

// =============================================
// BACKGROUND SYNC HANDLING
// =============================================
// Enables offline scores to sync even when app is closed
// Supported in Chrome/Edge, graceful degradation elsewhere

// Supabase config - injected at build time by Vite
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// IndexedDB constants (must match DatabaseManager.ts)
const DB_NAME = 'myK9Q_Replication';
const DB_VERSION = 5;
const OFFLINE_QUEUE_STORE = 'offline_queue';

/**
 * Open the replication database
 * Simplified version that only needs read/write access to offline_queue
 */
function openReplicationDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[SW] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    // If upgrade is needed, we're in trouble - shouldn't happen in SW
    request.onupgradeneeded = () => {
      console.warn('[SW] IndexedDB upgrade needed - this should not happen');
    };
  });
}

/**
 * Build the score update payload for Supabase REST API
 */
function buildScoreUpdate(score) {
  const { scoreData } = score;

  // Map scoreData to database columns (matches scoreSubmission.ts logic)
  const update = {
    result_status: scoreData.resultText,
    is_scored: true,
    entry_status: 'completed',
    updated_at: new Date().toISOString(),
  };

  // Optional fields
  if (scoreData.searchTime) {
    // Convert MM:SS.mm to seconds
    const [minutes, rest] = scoreData.searchTime.split(':');
    const [seconds, ms] = (rest || '0').split('.');
    update.search_time_seconds =
      parseInt(minutes || '0') * 60 +
      parseInt(seconds || '0') +
      parseInt(ms || '0') / 100;
  }

  if (scoreData.faultCount !== undefined) {
    update.total_faults = scoreData.faultCount;
  }

  if (scoreData.points !== undefined) {
    update.points_earned = scoreData.points;
  }

  if (scoreData.nonQualifyingReason) {
    update.disqualification_reason = scoreData.nonQualifyingReason;
  }

  return update;
}

/**
 * Sync offline queue to Supabase
 * Called by browser when network is available and sync tag is registered
 */
async function syncOfflineQueue() {
  console.log('[SW] 🔄 Background sync triggered');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[SW] Missing Supabase config - cannot sync');
    return;
  }

  let db;
  try {
    db = await openReplicationDB();
  } catch (error) {
    console.error('[SW] Failed to open database:', error);
    return;
  }

  // Get all mutations from offline_queue store
  let mutations;
  try {
    mutations = await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readonly');
      const store = tx.objectStore(OFFLINE_QUEUE_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[SW] Failed to read offline queue:', error);
    db.close();
    return;
  }

  // Filter for pending score submissions
  const pendingScores = mutations.filter(
    (m) => m.type === 'SUBMIT_SCORE' && m.status === 'pending'
  );

  if (pendingScores.length === 0) {
    console.log('[SW] No pending scores to sync');
    db.close();
    return;
  }

  console.log(`[SW] Syncing ${pendingScores.length} offline score(s)...`);

  let successCount = 0;

  for (const mutation of pendingScores) {
    const score = mutation.data;

    try {
      // Submit to Supabase REST API
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/entries?id=eq.${score.entryId}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
            'x-license-key': score.licenseKey,
          },
          body: JSON.stringify(buildScoreUpdate(score)),
        }
      );

      if (response.ok) {
        // Delete from queue
        await new Promise((resolve, reject) => {
          const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
          const store = tx.objectStore(OFFLINE_QUEUE_STORE);
          const request = store.delete(mutation.id);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });

        successCount++;
        console.log(`[SW] ✅ Synced score for entry ${score.entryId}`);
      } else {
        const errorText = await response.text();
        console.error(`[SW] ❌ Failed to sync entry ${score.entryId}:`, errorText);
        // Don't delete - browser will retry
      }
    } catch (error) {
      console.error(`[SW] ❌ Network error syncing entry ${score.entryId}:`, error);
      // Network error - browser will retry automatically
    }
  }

  db.close();

  // Notify all open clients that sync completed
  const allClients = await clients.matchAll({ type: 'window' });
  allClients.forEach((client) => {
    client.postMessage({
      type: 'BACKGROUND_SYNC_COMPLETE',
      syncedCount: successCount,
      totalCount: pendingScores.length,
    });
  });

  console.log(`[SW] 🎉 Background sync complete: ${successCount}/${pendingScores.length}`);
}

// Handle background sync events
self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-queue-sync') {
    event.waitUntil(syncOfflineQueue());
  } else if (event.tag === 'announcement-sync') {
    console.log('🔄 Background sync for announcements');
    // Could sync offline-created announcements here
  }
});

console.log('📱 Custom service worker with push notifications and background sync loaded');