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

export const useNetworkStatus = () => {
  const context = useContext(NetworkStatusContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used within NetworkStatusProvider');
  }
  return context;
};