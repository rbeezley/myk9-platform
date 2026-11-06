import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../showJudgeSuppliesService', () => ({
  showJudgeSuppliesService: {
    listForShow: vi.fn(),
    listForJudge: vi.fn(),
    ensureSeededForJudge: vi.fn(),
    updateRow: vi.fn(),
    addCustomRow: vi.fn(),
    deleteCustomRow: vi.fn(),
  },
}));

import { useShowJudgeSupplies } from '../useShowJudgeSupplies';
import { showJudgeSuppliesService } from '../showJudgeSuppliesService';
import type { ShowJudgeSupplyRow } from '../types';

const mockService = showJudgeSuppliesService as unknown as Record<
  keyof typeof showJudgeSuppliesService,
  ReturnType<typeof vi.fn>
>;

function row(overrides: Partial<ShowJudgeSupplyRow>): ShowJudgeSupplyRow {
  return {
    id: overrides.id ?? `r-${Math.random()}`,
    show_id: 'show-1',
    person_id: null,
    judge_name: 'Judge Smith',
    item_label: 'Clipboard',
    included: true,
    note: null,
    sort_order: 10,
    is_custom: false,
    created_at: '2026-05-16T00:00:00Z',
    updated_at: '2026-05-16T00:00:00Z',
    ...overrides,
  };
}

const wrapper =
  (client: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('useShowJudgeSupplies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when showId is missing', () => {
    const { result } = renderHook(() => useShowJudgeSupplies(null), {
      wrapper: wrapper(makeClient()),
    });
    expect(mockService.listForShow).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
  });

  it('returns the raw rows from the service for a show', async () => {
    mockService.listForShow.mockResolvedValue([
      row({ id: 'a', person_id: 'p1', judge_name: 'Alice', sort_order: 10, item_label: 'Pen' }),
      row({ id: 'b', person_id: 'p1', judge_name: 'Alice', sort_order: 20, item_label: 'Water' }),
      row({ id: 'c', person_id: null, judge_name: 'Bob', sort_order: 10, item_label: 'Pen' }),
    ]);

    const { result } = renderHook(() => useShowJudgeSupplies('show-1'), {
      wrapper: wrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockService.listForShow).toHaveBeenCalledWith('show-1');
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.rows.map(r => r.judge_name)).toEqual(['Alice', 'Alice', 'Bob']);
  });

  it('ensureSeeded mutation calls the service and invalidates the query', async () => {
    mockService.listForShow.mockResolvedValue([]);
    mockService.ensureSeededForJudge.mockResolvedValue([
      row({ id: 'seeded', person_id: 'p1', judge_name: 'Alice' }),
    ]);

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useShowJudgeSupplies('show-1'), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.ensureSeeded.mutateAsync({
      person_id: 'p1',
      judge_name: 'Alice',
      registry_id: 'AKC',
    });

    expect(mockService.ensureSeededForJudge).toHaveBeenCalledWith({
      show_id: 'show-1',
      person_id: 'p1',
      judge_name: 'Alice',
      registry_id: 'AKC',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['show-judge-supplies', 'show-1'] });
    // The report reads the same rows under its own key.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['judge-supply-checklist-report'] });
  });

  it('updateRow mutation calls the service with the id + patch', async () => {
    mockService.listForShow.mockResolvedValue([]);
    mockService.updateRow.mockResolvedValue(row({ id: 'r1', included: false }));

    const { result } = renderHook(() => useShowJudgeSupplies('show-1'), {
      wrapper: wrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.updateRow.mutateAsync({
      id: 'r1',
      patch: { included: false, note: 'skip this' },
    });

    expect(mockService.updateRow).toHaveBeenCalledWith('r1', {
      included: false,
      note: 'skip this',
    });
  });

  it('addCustomRow mutation forwards show_id from the hook', async () => {
    mockService.listForShow.mockResolvedValue([]);
    mockService.addCustomRow.mockResolvedValue(
      row({ id: 'new', item_label: 'Phone charger', is_custom: true })
    );

    const { result } = renderHook(() => useShowJudgeSupplies('show-1'), {
      wrapper: wrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.addCustomRow.mutateAsync({
      person_id: 'p1',
      judge_name: 'Alice',
      item_label: 'Phone charger',
      sort_order: 1000,
    });

    expect(mockService.addCustomRow).toHaveBeenCalledWith({
      show_id: 'show-1',
      person_id: 'p1',
      judge_name: 'Alice',
      item_label: 'Phone charger',
      sort_order: 1000,
    });
  });

  it('deleteCustomRow mutation calls the service with the id', async () => {
    mockService.listForShow.mockResolvedValue([]);
    mockService.deleteCustomRow.mockResolvedValue(undefined);

    const { result } = renderHook(() => useShowJudgeSupplies('show-1'), {
      wrapper: wrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.deleteCustomRow.mutateAsync('r1');
    expect(mockService.deleteCustomRow).toHaveBeenCalledWith('r1');
  });
});
