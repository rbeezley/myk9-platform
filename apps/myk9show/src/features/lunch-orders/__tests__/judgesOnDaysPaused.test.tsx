import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useJudgesOnDays } from '../judgesOnDays';

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useJudgesOnDays offline (MYK9-1997)', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('reports isPaused, not loading, when the read is paused with no data', async () => {
    onlineManager.setOnline(false);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useJudgesOnDays('show-1', ['t1']), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isPaused).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.hasData).toBe(false);
  });

  it('is not paused when the hook is disabled', () => {
    onlineManager.setOnline(false);
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useJudgesOnDays('show-1', ['t1'], false), {
      wrapper: wrapperFor(queryClient),
    });
    expect(result.current.isPaused).toBe(false);
  });
});
