import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useShowAccent } from './useShowAccent';

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    getShowById: vi.fn(),
  },
}));

import { replicatedShowsTable } from '@/services/replication';

const mockGetShowById = vi.mocked(replicatedShowsTable.getShowById);

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useShowAccent', () => {
  beforeEach(() => {
    mockGetShowById.mockReset();
  });

  it('returns style with --show-accent when show has valid hex', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
      accent_color: '#ff0000',
    });
    const { result } = renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toEqual({ '--show-accent': '#ff0000' });
    });
  });

  it('returns undefined when show has null accent_color', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
      accent_color: null,
    });
    const { result } = renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('returns undefined when show has no accent_color field', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
    });
    const { result } = renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('returns undefined when showId is undefined', () => {
    const { result } = renderHook(() => useShowAccent(undefined), { wrapper });
    expect(result.current).toBeUndefined();
    expect(mockGetShowById).not.toHaveBeenCalled();
  });

  it('returns undefined for short hex (#fff)', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
      accent_color: '#fff',
    });
    const { result } = renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('returns undefined for color name (red)', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
      accent_color: 'red',
    });
    const { result } = renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('returns undefined for CSS injection attempt', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
      accent_color: '#ff0000; background: url(evil)',
    });
    const { result } = renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('returns undefined for empty string', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
      accent_color: '',
    });
    const { result } = renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('returns undefined for 7-digit hex', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
      accent_color: '#ff00000',
    });
    const { result } = renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });

  it('accepts uppercase hex', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
      accent_color: '#C96442',
    });
    const { result } = renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toEqual({ '--show-accent': '#C96442' });
    });
  });

  it('reads from the replicated shows table (not direct Supabase)', async () => {
    mockGetShowById.mockResolvedValue({
      id: 'show-1',
      license_key: 'k',
      name: 'n',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      organization: 'AKC',
      accent_color: '#123456',
    });
    renderHook(() => useShowAccent('show-1'), { wrapper });
    await waitFor(() => {
      expect(mockGetShowById).toHaveBeenCalledWith('show-1');
    });
  });
});
