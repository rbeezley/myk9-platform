import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
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

/**
 * INTENT: no boot-time data prefetch lives here. Every page that shows the
 * shows list reads it on mount (`useShowsQuery`, 5 min staleTime); an app-wide
 * prefetch cost `/at-show`, sign-in and the landing page a five-table read on
 * a cold device for no gain (MYK9-1359).
 */
export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ReconnectRefetcher />
      {children}
      {/* TODO: Add ReactQueryDevtools when @tanstack/react-query-devtools is installed */}
    </QueryClientProvider>
  );
}
