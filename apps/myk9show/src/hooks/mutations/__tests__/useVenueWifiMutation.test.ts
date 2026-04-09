import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVenueWifiMutation } from '../useVenueWifiMutation';

const mockEq = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockNotificationsSuccess = vi.hoisted(() => vi.fn());
const mockNotificationsError = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: mockNotificationsSuccess,
    error: mockNotificationsError,
  },
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe('useVenueWifiMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  it('calls supabase update with correct fields', async () => {
    const { result } = renderHook(() => useVenueWifiMutation(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        showId: 'show-abc',
        network: 'VenueNet',
        password: 'secret123',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('shows');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        venue_wifi_network: 'VenueNet',
        venue_wifi_password: 'secret123',
      })
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'show-abc');
  });

  it('stores empty string as null in the DB', async () => {
    const { result } = renderHook(() => useVenueWifiMutation(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        showId: 'show-abc',
        network: '',
        password: '',
      });
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        venue_wifi_network: null,
        venue_wifi_password: null,
      })
    );
  });

  it('shows success notification on success', async () => {
    const { result } = renderHook(() => useVenueWifiMutation(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ showId: 'show-abc', network: 'Net', password: 'pw' });
    });

    expect(mockNotificationsSuccess).toHaveBeenCalledWith('WiFi info saved');
  });

  it('shows error notification and sets isError on failure', async () => {
    mockEq.mockResolvedValue({ error: new Error('db error') });

    const { result } = renderHook(() => useVenueWifiMutation(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      result.current.mutate({ showId: 'show-abc', network: 'Net', password: 'pw' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockNotificationsError).toHaveBeenCalledWith('Failed to save WiFi info');
  });
});
