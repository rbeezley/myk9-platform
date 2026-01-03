import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Hook to handle messages from the service worker
 * Primarily used for notification click navigation
 */
export const useServiceWorkerMessages = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for messages from service worker
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      const { type, url } = event.data;

      // Handle notification click messages from service worker
      if (type === 'NOTIFICATION_CLICK' && url) {
// Navigate to the URL
        // Note: The notification is already in the notification center from the original push,
        // so we don't need to add it again - just navigate
        navigate(url);
      }
    };

    // Register the message handler
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);

return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
};
    }
  }, [navigate]);
};
