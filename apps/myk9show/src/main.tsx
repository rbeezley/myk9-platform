import './services/observability/sentry';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { RouterProvider } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { router } from './router';
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
import { installSupportErrorCapture } from './features/support/supportDiagnostics';
import { scrubAnalyticsEvent } from './services/observability/vercelAnalytics';

// Keep the diagnostic ring available to support tickets in the browser, but
// avoid touching browser globals during SSR or module-loading tests.
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  installSupportErrorCapture();
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
        description: 'Reload to get the latest features and fixes.',
        duration: Infinity,
        action: {
          label: 'Update',
          onClick: () => {
            void applyPwaUpdate();
          },
        },
      });
    },
  });
}

logger.debug('Starting myK9Show...', 'app', {});

setupRouterPageViewTracking(router, monitoring);

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
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryProvider>
    {/* Vercel Web Analytics: cookieless page views, same-origin script and
        beacon so the CSP needs no change. Route changes are tracked by the
        script itself; the URL is scrubbed of query and fragment first. */}
    <Analytics
      mode={import.meta.env.DEV ? 'development' : 'production'}
      beforeSend={scrubAnalyticsEvent}
    />
  </StrictMode>
);
