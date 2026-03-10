/**
 * Unit tests for useSelfCheckinEnabled hook.
 * Tests cascade resolution, loading states, and fallback behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase — must be before import
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'rpc') return mockRpc;
        if (prop === 'from') return mockFrom;
        return undefined;
      },
    }
  ),
}));

// Import after mocks
const { useSelfCheckinEnabled } = await import('@/hooks/queries/useSelfCheckinEnabled');

describe('useSelfCheckinEnabled', () => {
  let queryClient: QueryClient;

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should default to enabled=true while loading', () => {
    // Never resolve the RPC call
    mockRpc.mockReturnValue({ single: () => new Promise(() => {}) });

    const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper });

    expect(result.current.enabled).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.reason).toBeUndefined();
  });

  it('should return enabled=true when RPC returns true', async () => {
    mockRpc.mockReturnValue({
      single: () => Promise.resolve({ data: true, error: null }),
    });

    const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.enabled).toBe(true);
    expect(result.current.reason).toBeUndefined();
  });

  it('should return enabled=false with reason when RPC returns false', async () => {
    mockRpc.mockReturnValue({
      single: () => Promise.resolve({ data: false, error: null }),
    });

    const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.enabled).toBe(false);
    expect(result.current.reason).toBe('Check-in disabled by show management');
  });

  it('should not fetch when classId is null', () => {
    const { result } = renderHook(() => useSelfCheckinEnabled(null), { wrapper });

    expect(result.current.enabled).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('should fall back to manual cascade on RPC error', async () => {
    // RPC fails
    mockRpc.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: { message: 'function not found' } }),
    });

    // Fallback query returns class with self_checkin_enabled = false
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                self_checkin_enabled: false,
                trials: { self_checkin_enabled: true, shows: { self_checkin_enabled: true } },
              },
              error: null,
            }),
        }),
      }),
    });

    const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Class-level override should take precedence
    expect(result.current.enabled).toBe(false);
  });

  it('should cascade to trial level when class level is null', async () => {
    mockRpc.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                self_checkin_enabled: null,
                trials: { self_checkin_enabled: false, shows: { self_checkin_enabled: true } },
              },
              error: null,
            }),
        }),
      }),
    });

    const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.enabled).toBe(false);
  });

  it('should cascade to show level when both class and trial are null', async () => {
    mockRpc.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                self_checkin_enabled: null,
                trials: { self_checkin_enabled: null, shows: { self_checkin_enabled: false } },
              },
              error: null,
            }),
        }),
      }),
    });

    const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.enabled).toBe(false);
  });

  it('should default to true when all cascade levels are null', async () => {
    mockRpc.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                self_checkin_enabled: null,
                trials: { self_checkin_enabled: null, shows: { self_checkin_enabled: null } },
              },
              error: null,
            }),
        }),
      }),
    });

    const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.enabled).toBe(true);
  });

  it('should default to true when fallback query returns no data', async () => {
    mockRpc.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useSelfCheckinEnabled('class-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.enabled).toBe(true);
  });
});
