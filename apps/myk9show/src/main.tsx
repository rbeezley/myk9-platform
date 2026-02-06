import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { QueryProvider } from './providers/QueryProvider';
import { logger } from '@/services/LoggingService';
import { initializeSettings } from './stores/settingsStore';

// Initialize settings (applies accent color, theme, etc. from localStorage)
initializeSettings();

// Clear any existing service workers to prevent console spam
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(error => {
    logger.debug('Error clearing service workers:', 'app', { data: error });
  });
}

logger.debug('Starting myK9Show...', 'app', {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryProvider>
        <ThemeProvider>
          <App />
          <Toaster
            toastOptions={{
              style: {
                background: '#fff',
                color: '#000',
              },
            }}
          />
        </ThemeProvider>
      </QueryProvider>
    </BrowserRouter>
  </StrictMode>
);
