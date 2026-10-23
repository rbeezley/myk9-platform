import { createContext, useContext, useMemo } from 'react';
import { NetworkQuality } from '@/lib/networkUtils';

/** Cold: changes only when connectivity flips or the offline notice is shown/dismissed. */
export interface NetworkConnectivity {
  isOnline: boolean;
  showOfflineMessage: boolean;
  retryConnection: () => void;
}

/** What `useNetworkStatus()` returns: connectivity plus the (hot) connection quality. */
export interface NetworkStatusContextType extends NetworkConnectivity {
  quality: NetworkQuality | null;
}

const NetworkConnectivityContext = createContext<NetworkConnectivity | null>(null);

/**
 * Hot: `quality` is re-created on every connection `change` event (RTT/downlink
 * drift on flaky ringside wifi), so it lives apart from connectivity.
 */
const NetworkQualityContext = createContext<NetworkQuality | null>(null);

export { NetworkConnectivityContext, NetworkQualityContext };

/**
 * Just the online flag, from the same app-wide NetworkStatusProvider. Leaf UI
 * (AskQ's Tera dock) reads it without demanding the provider in every test
 * harness; outside a provider, which only a test renders, it reads as online.
 * Does not re-render on connection-quality changes.
 */
export const useIsOnline = (): boolean => useContext(NetworkConnectivityContext)?.isOnline ?? true;

export const useNetworkStatus = (): NetworkStatusContextType => {
  const connectivity = useContext(NetworkConnectivityContext);
  const quality = useContext(NetworkQualityContext);
  const value = useMemo(
    () => (connectivity ? { ...connectivity, quality } : null),
    [connectivity, quality]
  );
  if (!value) {
    throw new Error('useNetworkStatus must be used within NetworkStatusProvider');
  }
  return value;
};
