import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { QueryProvider } from './providers/QueryProvider';

// Performance Optimization Imports (DISABLED FOR DEBUGGING)
// import { initializePerformanceOptimization } from './services/performance/PerformanceIntegrator';

// Clear any existing service workers to prevent console spam
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(error => {
    console.log('Error clearing service workers:', error);
  });
}

// Initialize performance optimization as early as possible (DISABLED FOR DEBUGGING)
console.log('🚀 Starting myK9Show (performance optimization disabled for debugging)...');
// Temporarily disabled to fix 404 loading issue
// initializePerformanceOptimization().catch(error => {
//   console.error('Performance optimization failed:', error);
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
