import { useState, useEffect } from 'react';

/**
 * Hook for managing optimistic feedback state
 */
export function useOptimisticFeedback() {
  const [error, setError] = useState<string | null>(null);
  const [showOffline, setShowOffline] = useState(false);

  // Listen for online/offline status
  useEffect(() => {
    const handleOnline = () => setShowOffline(false);
    const handleOffline = () => setShowOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial status
    setShowOffline(!navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showError = (message: string) => setError(message);
  const dismissError = () => setError(null);

  return {
    error,
    showError,
    dismissError,
    showOffline
  };
}