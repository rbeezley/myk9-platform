import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createAppQueryClient } from '@/lib/queryClient';
import { useJudgesWithQualifications, type JudgeListRefresh } from './useJudgesWithQualifications';

vi.mock('@/services/database/judges', () => ({
  getJudgesWithQualifications: vi.fn(async () => ({ data: [], error: null })),
}));

function observerOptions(refresh?: JudgeListRefresh) {
  // The app's own client, so its defaults (refetchOnReconnect: 'always') are the real ones.
  const queryClient = createAppQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  renderHook(() => useJudgesWithQualifications(true, refresh), { wrapper });
  const query = queryClient.getQueryCache().find({ queryKey: ['judges', 'withQualifications'] });
  return query?.observers[0]?.options;
}

describe('useJudgesWithQualifications refresh mode (MYK9-1323)', () => {
  it("keeps Edit Show's refetch on every focus by default", async () => {
    const options = observerOptions();
    await waitFor(() => expect(options).toBeDefined());
    expect(options?.refetchOnWindowFocus).toBe('always');
    expect(options?.refetchOnReconnect).toBe('always');
  });

  it("'when-stale' refetches on focus and on reconnect only once stale", async () => {
    const options = observerOptions('when-stale');
    await waitFor(() => expect(options).toBeDefined());
    expect(options?.refetchOnWindowFocus).toBe(true);
    expect(options?.refetchOnReconnect).toBe(true);
  });
});
