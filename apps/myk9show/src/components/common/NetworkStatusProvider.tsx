import React, { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { OFFLINE_SAVED_MESSAGE } from '@/lib/offlineCopy';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus, useNetworkQuality } from '@/lib/networkUtils';
import {
  NetworkConnectivityContext,
  NetworkQualityContext,
  useNetworkStatus,
} from '@/hooks/useNetworkStatus';

interface NetworkStatusProviderProps {
  children: React.ReactNode;
}

const OFFLINE_TOAST_ID = 'network-offline';
const OFFLINE_TOAST_MS = 6000;

// INTENT: offline is expected ringside, not an alarm. One short toast on going
// offline, never a pinned card over the scoresheet's Save/Cancel footer. The
// persistent offline signal is the ringside header badge (MYK9-1744).
export const NetworkStatusProvider: React.FC<NetworkStatusProviderProps> = ({ children }) => {
  const isOnline = useOnlineStatus();
  const quality = useNetworkQuality();

  // Fires on mount when the app starts offline and on each online -> offline
  // transition; re-renders while offline do not change `isOnline`, so no repeat.
  // The fixed id also collapses a StrictMode double-run into one toast.
  useEffect(() => {
    if (isOnline) return;
    toast(OFFLINE_SAVED_MESSAGE, {
      id: OFFLINE_TOAST_ID,
      duration: OFFLINE_TOAST_MS,
      dismissible: true,
    });
  }, [isOnline]);

  // `quality` changes on every connection `change` event; keeping it in its own
  // context means the many isOnline-only consumers do not re-render with it.
  const connectivity = useMemo(() => ({ isOnline }), [isOnline]);

  return (
    <NetworkConnectivityContext.Provider value={connectivity}>
      <NetworkQualityContext.Provider value={quality}>{children}</NetworkQualityContext.Provider>
    </NetworkConnectivityContext.Provider>
  );
};

// Component for displaying network status in header/nav
export const NetworkStatusIcon: React.FC = () => {
  const { isOnline, quality } = useNetworkStatus();

  if (!isOnline) {
    return (
      <div className="flex items-center text-destructive" title="Offline">
        <WifiOff className="h-4 w-4" />
      </div>
    );
  }

  const getConnectionQuality = () => {
    if (!quality) return 'unknown';

    switch (quality.effectiveType) {
      case '4g':
        return 'excellent';
      case '3g':
        return 'good';
      case '2g':
        return 'poor';
      case 'slow-2g':
        return 'very-poor';
      default:
        return 'unknown';
    }
  };

  const connectionQuality = getConnectionQuality();
  const getColorClass = () => {
    switch (connectionQuality) {
      case 'excellent':
        return 'text-green-600';
      case 'good':
        return 'text-blue-600';
      case 'poor':
        return 'text-yellow-600';
      case 'very-poor':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getTitle = () => {
    if (!quality) return 'Online';
    return `Online - ${quality.effectiveType.toUpperCase()} (${quality.downlink} Mbps, ${quality.rtt}ms RTT)`;
  };

  return (
    <div className={`flex items-center ${getColorClass()}`} title={getTitle()}>
      <Wifi className="h-4 w-4" />
    </div>
  );
};
