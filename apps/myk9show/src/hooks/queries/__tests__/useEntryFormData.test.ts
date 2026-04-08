import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  },
}));

import { useEntryFormData } from '../useEntryFormData';

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useEntryFormData', () => {
  it('returns isLoading true when showId is provided', () => {
    const { result } = renderHook(() => useEntryFormData({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('does not fetch when showId is empty', () => {
    const { result } = renderHook(() => useEntryFormData({ showId: '' }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.dogs).toEqual([]);
  });
});
