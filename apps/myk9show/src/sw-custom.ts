/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { installSkipWaitingHandler } from '@myk9/pwa-update/sw';
import { getNotificationActionUrl, routeNotificationClick } from './swClickNavigation';
import { loadRingsideNavigation } from './ringsideNavigation';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Workbox precaching — vite-plugin-pwa injects the manifest here
precacheAndRoute(self.__WB_MANIFEST);

// A full reload requests the deep-link document, not /index.html. The handler
// bounds the network wait and rejects non-app responses before using the
// precached shell. NavigationRoute ignores API and asset requests; the
// allowlist keeps other app paths untouched.
const precachedShell = createHandlerBoundToURL('/index.html');
registerRoute(
  new NavigationRoute(
    options => loadRingsideNavigation(options.request, () => precachedShell(options)),
    { allowlist: [/^\/at-show(?:\/|$)/] }
  )
);

// Activate the new SW immediately when the page asks (prompt-then-skip-waiting pattern).
installSkipWaitingHandler(self);

// Handle push notifications when app is in background
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'myK9Show';
    const options: NotificationOptions = {
      body: payload.body || '',
      icon: '/pwa-192x192.png',
      badge: '/notification-badge-96.png',
      tag: payload.data?.announcementId || payload.data?.messageId || payload.type || 'default',
      data: payload,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Non-JSON push data — ignore
  }
});

// Handle notification click — focus existing window and navigate, or open new window
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl = getNotificationActionUrl(event.notification.data, self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
      return routeNotificationClick(clients, targetUrl, url => self.clients.openWindow(url));
    })
  );
});
