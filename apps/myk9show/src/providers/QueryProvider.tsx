import { ReactNode, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { prefetchCriticalData } from '@/utils/performanceOptimizations';
import { useRefetchQueriesOnReconnect } from '@/hooks/useRefetchQueriesOnReconnect';

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * Mounted INSIDE the provider because the hook reads the client from context.
 * Kept as its own component so `QueryProvider` itself stays a plain wrapper.
 */
function ReconnectRefetcher() {
  useRefetchQueriesOnReconnect();
  return null;
}

export function QueryProvider({ children }: QueryProviderProps) {
  useEffect(() => {
    const prefetchTimer = window.setTimeout(() => {
      void prefetchCriticalData(queryClient);
    }, 1000);

    return () => window.clearTimeout(prefetchTimer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ReconnectRefetcher />
      {children}
      {/* TODO: Add ReactQueryDevtools when @tanstack/react-query-devtools is installed */}
    </QueryClientProvider>
  );
}
