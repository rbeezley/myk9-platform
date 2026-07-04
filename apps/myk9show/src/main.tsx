import './services/observability/sentry';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';
// Ringside page styles — required by the @myk9/ringside EntryList mount at
// /at-show (Phase 1a). Imported unconditionally; the route itself is flag-gated.
import '@myk9/ringside/styles';
import { ThemeProvider } from './context/ThemeContext';
import { BrowserRouter } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { QueryProvider } from './providers/QueryProvider';
import { logger } from '@/services/LoggingService';
import { initializeSettings } from './store/settingsStore';
import { ToastContainer } from '@/components/notifications/ToastContainer';
import { setupPwa, applyPwaUpdate } from '@/services/pwa/pwaUpdate';

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
    <BrowserRouter>
      <QueryProvider>
        <ThemeProvider>
          <App />
          <Toaster
            theme="system"
            richColors
            closeButton
            position="bottom-right"
            offset={{
              right: 'max(1rem, env(safe-area-inset-right))',
              bottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
            mobileOffset={{
              right: 'max(1rem, env(safe-area-inset-right))',
              bottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
          />
          <ToastContainer />
        </ThemeProvider>
      </QueryProvider>
    </BrowserRouter>
  </StrictMode>
);
