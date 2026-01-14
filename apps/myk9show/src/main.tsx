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

// Performance Optimization Imports (DISABLED FOR DEBUGGING)
// import { initializePerformanceOptimization } from './services/performance/PerformanceIntegrator';

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

// Initialize performance optimization as early as possible (DISABLED FOR DEBUGGING)
logger.debug('🚀 Starting myK9Show (performance optimization disabled for debugging)...', 'app', {});
// Temporarily disabled to fix 404 loading issue
// initializePerformanceOptimization().catch(error => {
//   logger.error('Performance optimization failed:', 'app', {}, error as Error);
//   // Continue with app initialization even if performance optimization fails
// });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }}>
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
