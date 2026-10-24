import { useMemo, type ReactNode } from 'react';
import {
  NetworkConnectivityContext,
  NetworkQualityContext,
  type NetworkStatusContextType,
} from '@/hooks/useNetworkStatus';

/**
 * Publishes a combined `{ isOnline, quality, showOfflineMessage, retryConnection }`
 * value the way `NetworkStatusProvider` does (two contexts).
 */
export function NetworkStatusTestProvider({
  value,
  children,
}: {
  value: NetworkStatusContextType;
  children?: ReactNode;
}) {
  const { isOnline, showOfflineMessage, retryConnection, quality } = value;
  const connectivity = useMemo(
    () => ({ isOnline, showOfflineMessage, retryConnection }),
    [isOnline, showOfflineMessage, retryConnection]
  );
  return (
    <NetworkConnectivityContext.Provider value={connectivity}>
      <NetworkQualityContext.Provider value={quality}>{children}</NetworkQualityContext.Provider>
    </NetworkConnectivityContext.Provider>
  );
}
