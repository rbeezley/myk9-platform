/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Workbox precaching — vite-plugin-pwa injects the manifest here
precacheAndRoute(self.__WB_MANIFEST);

// Handle push notifications when app is in background
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'myK9Show';
    const options: NotificationOptions = {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-badge.png',
      tag: payload.type || 'default',
      data: payload,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Non-JSON push data — ignore
  }
});

// Handle notification click — focus or open the app
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing window if available
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow('/');
    })
  );
});
