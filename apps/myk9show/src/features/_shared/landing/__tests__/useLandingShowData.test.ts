import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { useLandingShowData } from '../useLandingShowData';

vi.mock('@/services/database/_shared/entryCounts', () => ({
  fetchPublicEntryCountsByShow: vi.fn(),
}));

const queryState = vi.hoisted(() => ({
  current: { data: [] as Record<string, unknown>[], isError: false },
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => queryState.current,
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'test-user' }, loading: false }),
}));

const show = {
  id: 'show-1',
  name: 'Truthful Counts Trial',
  organization: 'Prairie Dog Club',
} as Show;

describe('useLandingShowData entry-read state', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: new QueryClient() }, children);

  it('distinguishes empty, failed, and recovered entry reads', () => {
    queryState.current = { data: [], isError: false };
    const { result, rerender } = renderHook(() => useLandingShowData(show, null, []), { wrapper });
    expect(result.current.entryCount).toBe(0);

    queryState.current = { data: [], isError: true };
    rerender();
    expect(result.current.entryCount).toBeNull();

    queryState.current = { data: [{ id: 'entry-1' }], isError: false };
    rerender();
    expect(result.current.entryCount).toBe(1);
  });
});
