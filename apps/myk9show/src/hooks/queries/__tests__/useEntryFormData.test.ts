import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { EntryFormRegistration } from '@/lib/reports/entryFormTypes';
import { chooseEntryFormRegistration, useEntryFormData } from '../useEntryFormData';

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
    // SA-006: secretary now resolved via the get_show_officials RPC
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const akcRegistration: EntryFormRegistration = {
  organization: 'AKC',
  registeredName: 'AKC Dog',
  registrationNumber: 'AKC123',
  variety: null,
};

const ukcRegistration: EntryFormRegistration = {
  organization: 'UKC',
  registeredName: 'UKC Dog',
  registrationNumber: 'UKC123',
  variety: null,
};

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

describe('chooseEntryFormRegistration', () => {
  it('preserves AKC as the default preferred registration', () => {
    expect(chooseEntryFormRegistration(ukcRegistration, akcRegistration)).toBe(akcRegistration);
  });

  it('prefers UKC when UKC official forms request it', () => {
    expect(chooseEntryFormRegistration(akcRegistration, ukcRegistration, 'UKC')).toBe(
      ukcRegistration
    );
  });
});
