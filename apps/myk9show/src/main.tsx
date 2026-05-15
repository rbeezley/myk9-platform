import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { BrowserRouter } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { QueryProvider } from './providers/QueryProvider';
import { logger } from '@/services/LoggingService';
import { initializeSettings } from './stores/settingsStore';
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
        description: "Reload to get the latest features and fixes.",
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryProvider>
        <ThemeProvider>
          <App />
          <Toaster theme="system" richColors closeButton />
          <ToastContainer />
        </ThemeProvider>
      </QueryProvider>
    </BrowserRouter>
  </StrictMode>
);
