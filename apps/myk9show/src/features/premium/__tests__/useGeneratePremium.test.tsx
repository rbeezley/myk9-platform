import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeneratePremium } from '../useGeneratePremium';

const invokeMock = vi.hoisted(() => vi.fn());
const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useGeneratePremium', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    consoleErrorMock.mockClear();
  });

  afterAll(() => {
    consoleErrorMock.mockRestore();
  });

  it('hides backend error details from the generation error', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned 500',
        context: new Response('{"detail":"permission denied"}', { status: 500 }),
      },
    });

    const { result } = renderHook(() => useGeneratePremium(), { wrapper });

    await expect(result.current.generate('show-1')).rejects.toThrow(
      "We couldn't generate the premium list. Please try again."
    );
    await waitFor(() => {
      expect(result.current.error).toBe("We couldn't generate the premium list. Please try again.");
    });
    expect(consoleErrorMock).toHaveBeenCalledWith('[premium-generation] request failed', {
      showId: 'show-1',
    });
    expect(consoleErrorMock).not.toHaveBeenCalledWith(
      '[premium-generation] request failed',
      expect.objectContaining({ context: expect.anything() })
    );
  });
});
