import './services/observability/sentry';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { Analytics } from '@vercel/analytics/react';
import { RootRouter } from './boot/RootRouter';
import type { AppRouter } from './boot/GuestLanding';
import { isGuestLandingBoot } from './boot/isGuestLandingBoot';
import { startInstallPromptCapture } from './boot/installPromptCapture';
import './index.css';
// Ringside page styles — required by the @myk9/ringside EntryList mount at
// /at-show (Phase 1a). Imported unconditionally; the route itself is flag-gated.
import '@myk9/ringside/styles';
import { ThemeProvider } from './context/ThemeContext';
import { toast } from 'sonner';
import { QueryProvider } from './providers/QueryProvider';
import { logger } from '@/services/LoggingService';
import { initializeSettings } from './store/settingsStore';
import { setupPwa, applyPwaUpdate } from '@/services/pwa/pwaUpdate';
import { monitoring } from './services/MonitoringService';
import { setupRouterPageViewTracking } from './services/RouterPageViewTracking';
import { UPDATE_THE_APP_LABEL } from './lib/offlineCopy';
import { installSupportErrorCapture } from './features/support/supportDiagnostics';
import {
  scrubAnalyticsEvent,
  shouldMountVercelAnalytics,
} from './services/observability/vercelAnalytics';

// Keep the diagnostic ring available to support tickets in the browser, but
// avoid touching browser globals during SSR or module-loading tests.
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  installSupportErrorCapture();
}

// The browser makes its install offer once per page load, before the install banner has loaded.
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  startInstallPromptCapture();
}

// Everyone but a first-time landing visitor needs the full app, so start fetching it now, not
// after React has mounted (MYK9-2140). RootRouter's own import then resolves from this one; a
// failure here is left for RootRouter, which retries and reports it.
const guestBoot = isGuestLandingBoot(window.location);
if (!guestBoot) {
  void import('./router').catch(() => undefined);
}

// Initialize settings (applies accent color, theme, etc. from localStorage)
initializeSettings();

// In DEV, clear any existing service workers to prevent stale chunks during development.
// In PROD, register the SW and wire up the update prompt.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then(registrations => {
      for (const registration of registrations) {
        registration.unregister();
      }
    })
    .catch(error => {
      logger.debug('Error clearing service workers:', 'app', { data: error });
    });
} else if (!import.meta.env.DEV) {
  setupPwa({
    onPrompt: () => {
      toast('A new version of myK9Show is available', {
        description: 'Update the app to get the latest features and fixes.',
        duration: Infinity,
        action: {
          label: UPDATE_THE_APP_LABEL,
          onClick: () => {
            void applyPwaUpdate();
          },
        },
      });
    },
  });
}

logger.debug('Starting myK9Show...', 'app', {});

// The landing page's own router and the full app's router are tracked in turn (MYK9-2140).
let stopPageViewTracking: (() => void) | undefined;
const trackRouter = (router: AppRouter) => {
  stopPageViewTracking?.();
  stopPageViewTracking = setupRouterPageViewTracking(router, monitoring);
};

const sentryReactErrorHandler = Sentry.reactErrorHandler();

createRoot(document.getElementById('root')!, {
  onUncaughtError: (error, errorInfo) => {
    sentryReactErrorHandler(error, {
      componentStack: errorInfo.componentStack ?? null,
    });
  },
  onRecoverableError: (error, errorInfo) => {
    sentryReactErrorHandler(error, {
      componentStack: errorInfo.componentStack ?? null,
    });
  },
}).render(
  <StrictMode>
    <QueryProvider>
      <ThemeProvider>
        <RootRouter guestBoot={guestBoot} onRouter={trackRouter} />
      </ThemeProvider>
    </QueryProvider>
    {/* Vercel Web Analytics: cookieless page views, same-origin script and
        beacon so the CSP needs no change. Route changes are tracked by the
        script itself; the URL is scrubbed of query and fragment first. Not
        mounted on localhost, where the script 404s and reddens E2E. */}
    {shouldMountVercelAnalytics(window.location.hostname) && (
      <Analytics mode="production" beforeSend={scrubAnalyticsEvent} />
    )}
  </StrictMode>
);
