import { ReactNode, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { prefetchCriticalData } from '@/utils/performanceOptimizations';

interface QueryProviderProps {
  children: ReactNode;
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
      {children}
      {/* TODO: Add ReactQueryDevtools when @tanstack/react-query-devtools is installed */}
    </QueryClientProvider>
  );
}
