import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useResultSubmission, useResultSubmissions } from '../useResultSubmission';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

const mockSingle = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockOrder = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

// ---------------------------------------------------------------------------
// useResultSubmission (mutation)
// ---------------------------------------------------------------------------

describe('useResultSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a row and returns the created record on success', async () => {
    const mockRow = {
      id: 'sub-1',
      show_id: 'show-1',
      trial_id: null,
      organization: 'AKC',
      sport_type: 'scent_work',
      submitted_at: '2026-05-10T12:00:00Z',
      submitted_by: null,
      xml_payload: '<AKCResults/>',
      status: 'sent',
    };

    mockSingle.mockResolvedValue({ data: mockRow, error: null });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const { result } = renderHook(() => useResultSubmission('show-1'), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        show_id: 'show-1',
        organization: 'AKC',
        sport_type: 'scent_work',
        xml_payload: '<AKCResults/>',
        status: 'sent',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('result_submissions');
    expect(result.current.isError).toBe(false);
  });

  it('sets isError when supabase returns an error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'insert failed' } });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const { result } = renderHook(() => useResultSubmission('show-1'), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        show_id: 'show-1',
        organization: 'AKC',
        sport_type: 'scent_work',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('isPending is false before any mutation is fired', () => {
    mockFrom.mockReturnValue({ insert: mockInsert });

    const { result } = renderHook(() => useResultSubmission(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isPending).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useResultSubmissions (query)
// ---------------------------------------------------------------------------

describe('useResultSubmissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and returns submission rows for a show', async () => {
    const rows = [
      {
        id: 'sub-1',
        show_id: 'show-1',
        trial_id: null,
        organization: 'AKC',
        sport_type: 'scent_work',
        submitted_at: '2026-05-10T12:00:00Z',
        submitted_by: null,
        xml_payload: null,
        status: 'sent',
      },
    ];

    mockOrder.mockResolvedValue({ data: rows, error: null });
    mockEq.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() => useResultSubmissions('show-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].organization).toBe('AKC');
  });

  it('returns empty array when no rows exist', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockEq.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() => useResultSubmissions('show-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(0);
  });

  it('does not fetch when showId is empty string', () => {
    const { result } = renderHook(() => useResultSubmissions(''), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
