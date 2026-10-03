import { createContext, useContext } from 'react';
import { NetworkQuality } from '@/lib/networkUtils';

interface NetworkStatusContextType {
  isOnline: boolean;
  quality: NetworkQuality | null;
  showOfflineMessage: boolean;
  retryConnection: () => void;
}

const NetworkStatusContext = createContext<NetworkStatusContextType | null>(null);

export { NetworkStatusContext };

/**
 * Just the online flag, from the same app-wide NetworkStatusProvider. Leaf UI
 * (AskQ's Tera dock) reads it without demanding the provider in every test
 * harness; outside a provider, which only a test renders, it reads as online.
 */
export const useIsOnline = (): boolean => useContext(NetworkStatusContext)?.isOnline ?? true;

export const useNetworkStatus = () => {
  const context = useContext(NetworkStatusContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used within NetworkStatusProvider');
  }
  return context;
};
