import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeneratePremium } from '../useGeneratePremium';
import { generatedPremium } from './fixtures/generatedPremium';

const invokeMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
    rpc: rpcMock,
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
    rpcMock.mockReset();
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
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[premium-generation] request failed',
      expect.objectContaining({ showId: 'show-1', error: expect.anything() })
    );
    expect(consoleErrorMock).not.toHaveBeenCalledWith(
      '[premium-generation] request failed',
      expect.objectContaining({ context: expect.anything() })
    );
  });

  it('rejects malformed generated premium data instead of trusting an unchecked response', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useGeneratePremium(), { wrapper });

    await expect(result.current.generate('show-1')).rejects.toThrow();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[premium-generation] invalid response shape',
      expect.objectContaining({ showId: 'show-1', error: expect.anything() })
    );
  });

  it("attaches the club's officers and the show's Event Committee to the generated facts (MYK9-2064)", async () => {
    invokeMock.mockResolvedValue({ data: generatedPremium(), error: null });
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve({
        data:
          name === 'get_show_committee'
            ? [{ name: 'Pat Chair', sort_order: 0 }]
            : [{ position: 'president', name: 'Pat President' }],
        error: null,
      })
    );
    const { result } = renderHook(() => useGeneratePremium(), { wrapper });

    const premium = await result.current.generate('show-1');

    expect(rpcMock).toHaveBeenCalledWith('get_show_committee', { p_show_id: 'show-1' });
    expect(premium.committee).toEqual(['Pat Chair']);
    expect(premium.officers).toEqual([{ position: 'president', name: 'Pat President' }]);
  });

  it('still generates, with no committee, when the committee read fails (MYK9-2064)', async () => {
    invokeMock.mockResolvedValue({ data: generatedPremium(), error: null });
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'get_show_committee'
          ? { data: null, error: { message: 'boom' } }
          : { data: [], error: null }
      )
    );
    const { result } = renderHook(() => useGeneratePremium(), { wrapper });

    const premium = await result.current.generate('show-1');

    expect(premium.committee).toBeUndefined();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[premium-generation] committee read failed',
      expect.objectContaining({ showId: 'show-1' })
    );
  });

  describe('the secretary and chair come from show_officials (MYK9-2053)', () => {
    const officialsRows = [
      {
        user_id: 'p1',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@test.com',
        role: 'secretary',
        phone: '9185550000',
      },
      {
        user_id: 'p2',
        first_name: 'Bob',
        last_name: 'Jones',
        email: 'bob@test.com',
        role: 'chairman',
        phone: null,
      },
    ];

    it('puts the officials into the generated premium', async () => {
      invokeMock.mockResolvedValue({ data: generatedPremium(), error: null });
      rpcMock.mockImplementation((name: string) =>
        Promise.resolve({ data: name === 'get_show_officials' ? officialsRows : [], error: null })
      );
      const { result } = renderHook(() => useGeneratePremium(), { wrapper });

      const premium = await result.current.generate('show-1');

      expect(rpcMock).toHaveBeenCalledWith('get_show_officials', { p_show_id: 'show-1' });
      expect(premium.secretary).toMatchObject({
        name: 'Jane Smith',
        email: 'jane@test.com',
        phone: '9185550000',
      });
      expect(premium.officials.chairman).toMatchObject({
        name: 'Bob Jones',
        email: 'bob@test.com',
      });
    });

    it('fails the publish when the officials cannot be read, never publishing a blank', async () => {
      invokeMock.mockResolvedValue({ data: generatedPremium(), error: null });
      rpcMock.mockImplementation((name: string) =>
        Promise.resolve(
          name === 'get_show_officials'
            ? { data: null, error: { message: 'boom' } }
            : { data: [], error: null }
        )
      );
      const { result } = renderHook(() => useGeneratePremium(), { wrapper });

      await expect(result.current.generate('show-1')).rejects.toMatchObject({
        name: 'PremiumPublishError',
      });
    });
  });
});
