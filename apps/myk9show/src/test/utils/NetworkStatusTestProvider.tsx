import { useMemo, type ReactNode } from 'react';
import {
  NetworkConnectivityContext,
  NetworkQualityContext,
  type NetworkStatusContextType,
} from '@/hooks/useNetworkStatus';

/**
 * Publishes a combined `{ isOnline, quality }`
 * value the way `NetworkStatusProvider` does (two contexts).
 */
export function NetworkStatusTestProvider({
  value,
  children,
}: {
  value: NetworkStatusContextType;
  children?: ReactNode;
}) {
  const { isOnline, quality } = value;
  const connectivity = useMemo(() => ({ isOnline }), [isOnline]);
  return (
    <NetworkConnectivityContext.Provider value={connectivity}>
      <NetworkQualityContext.Provider value={quality}>{children}</NetworkQualityContext.Provider>
    </NetworkConnectivityContext.Provider>
  );
}
