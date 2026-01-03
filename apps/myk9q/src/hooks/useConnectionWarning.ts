/**
 * Connection Warning Hook
 *
 * Monitors network connection type and shows friendly warnings
 * when using cellular data for sync operations.
 */

import { useEffect, useState } from 'react';

/** Network Information API connection object */
interface NetworkInformationConnection {
  type?: 'wifi' | 'ethernet' | 'cellular' | 'bluetooth' | 'none' | 'unknown' | 'other';
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi';
  downlink?: number;
  saveData?: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

/** Extended Navigator interface for Network Information API */
interface NavigatorWithNetworkInfo extends Navigator {
  connection?: NetworkInformationConnection;
  mozConnection?: NetworkInformationConnection;
  webkitConnection?: NetworkInformationConnection;
}

export type ConnectionType = 'wifi' | 'cellular' | 'unknown' | 'offline';

interface ConnectionInfo {
  type: ConnectionType;
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

/**
 * Get current connection information
 */
function getConnectionInfo(): ConnectionInfo {
  // Check if online
  if (!navigator.onLine) {
    return { type: 'offline' };
  }

  // Check for Network Information API
  const nav = navigator as NavigatorWithNetworkInfo;
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

  if (connection) {
    // Determine connection type
    let type: ConnectionType = 'unknown';

    if (connection.type) {
      // Standard API
      if (connection.type === 'wifi' || connection.type === 'ethernet') {
        type = 'wifi';
      } else if (connection.type === 'cellular') {
        type = 'cellular';
      }
    } else if (connection.effectiveType) {
      // Fallback to effectiveType
      // 'slow-2g', '2g', '3g', '4g' are considered cellular
      if (['slow-2g', '2g', '3g', '4g'].includes(connection.effectiveType)) {
        type = 'cellular';
      } else if (connection.effectiveType === 'wifi') {
        type = 'wifi';
      }
    }

    return {
      type,
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      saveData: connection.saveData,
    };
  }

  // No Network Information API - assume wifi for desktop browsers
  // (Safari, older browsers)
  return { type: 'unknown' };
}

/**
 * Hook to monitor connection type and show warnings
 */
export function useConnectionWarning() {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>(getConnectionInfo());

  useEffect(() => {
    const updateConnection = () => {
      setConnectionInfo(getConnectionInfo());
    };

    // Listen for online/offline events
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);

    // Listen for connection changes (if supported)
    const nav = navigator as NavigatorWithNetworkInfo;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (connection) {
      connection.addEventListener('change', updateConnection);
    }

    // Initial check
    updateConnection();

    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);

      if (connection) {
        connection.removeEventListener('change', updateConnection);
      }
    };
  }, []);

  /**
   * Check if on cellular data
   */
  const isOnCellular = connectionInfo.type === 'cellular';

  /**
   * Check if offline
   */
  const isOffline = connectionInfo.type === 'offline';

  /**
   * Check if on WiFi
   */
  const isOnWiFi = connectionInfo.type === 'wifi';

  /**
   * Get a friendly warning message for cellular usage
   */
  const getCellularWarning = (action: string = 'Syncing data'): string => {
    return `${action} on cellular data - this may use your data plan`;
  };

  /**
   * Get a friendly offline message
   */
  const getOfflineMessage = (): string => {
    return 'You are offline - changes will sync when connection is restored';
  };

  return {
    connectionInfo,
    isOnCellular,
    isOffline,
    isOnWiFi,
    getCellularWarning,
    getOfflineMessage,
  };
}
