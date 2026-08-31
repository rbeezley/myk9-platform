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
          maybeSingle: vi.fn().mockResolvedValue({ data: mockAgreement, error: null }),
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

  // An organization with no configured agreement is a CONFIGURATION FACT, not a
  // failure. Only 'AKC' is seeded (migration 122), and while this resolved as
  // PGRST116 from .single() every UKC and ASCA show blocked entry permanently
  // behind a retry that re-threw forever.
  it('resolves to null when the organization has no agreement configured', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useOrganizationAgreement('UKC'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('returns error when the query genuinely fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'network unreachable', code: '08006' },
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useOrganizationAgreement('AKC'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
