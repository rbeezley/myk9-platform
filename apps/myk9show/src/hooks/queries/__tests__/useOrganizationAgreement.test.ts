import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOrganizationAgreement } from '../useOrganizationAgreement';

// [EXPANDED] testUtils exports createTestQueryClient but not a wrapper component.
// Build an inline wrapper for renderHook using React.createElement to avoid JSX in .ts file.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// Mock supabase
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/services/database/supabaseClient';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

describe('useOrganizationAgreement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns agreement text for a valid organization', async () => {
    const mockAgreement = {
      organization: 'AKC',
      agreement_text: 'I certify that I am the actual owner...',
    };
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockAgreement, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useOrganizationAgreement('AKC'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.agreement_text).toBe('I certify that I am the actual owner...');
    expect(mockFrom).toHaveBeenCalledWith('organization_agreements');
  });

  it('is disabled when organization is empty', () => {
    const { result } = renderHook(() => useOrganizationAgreement(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
  });

  it('returns error when query fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found', code: 'PGRST116' },
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useOrganizationAgreement('UNKNOWN'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
