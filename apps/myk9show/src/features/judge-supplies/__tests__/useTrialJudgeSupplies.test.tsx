import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../trialJudgeSuppliesService', () => ({
  trialJudgeSuppliesService: {
    listForTrial: vi.fn(),
    listForShow: vi.fn(),
    listForJudge: vi.fn(),
    ensureSeededForJudge: vi.fn(),
    updateRow: vi.fn(),
    addCustomRow: vi.fn(),
    deleteCustomRow: vi.fn(),
  },
}));

import { useTrialJudgeSupplies } from '../useTrialJudgeSupplies';
import { trialJudgeSuppliesService } from '../trialJudgeSuppliesService';
import type { TrialJudgeSupplyRow } from '../types';

const mockService = trialJudgeSuppliesService as unknown as Record<
  keyof typeof trialJudgeSuppliesService,
  ReturnType<typeof vi.fn>
>;

function row(overrides: Partial<TrialJudgeSupplyRow>): TrialJudgeSupplyRow {
  return {
    id: overrides.id ?? `r-${Math.random()}`,
    trial_id: 'trial-1',
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

describe('useTrialJudgeSupplies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when trialId is missing', () => {
    const { result } = renderHook(() => useTrialJudgeSupplies(null), {
      wrapper: wrapper(makeClient()),
    });
    expect(mockService.listForTrial).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
    expect(result.current.groups).toEqual([]);
  });

  it('fetches rows for a trial and groups them by judge', async () => {
    mockService.listForTrial.mockResolvedValue([
      row({ id: 'a', person_id: 'p1', judge_name: 'Alice', sort_order: 10, item_label: 'Pen' }),
      row({ id: 'b', person_id: 'p1', judge_name: 'Alice', sort_order: 20, item_label: 'Water' }),
      row({ id: 'c', person_id: null, judge_name: 'Bob', sort_order: 10, item_label: 'Pen' }),
    ]);

    const { result } = renderHook(() => useTrialJudgeSupplies('trial-1'), {
      wrapper: wrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockService.listForTrial).toHaveBeenCalledWith('trial-1');
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.groups[0].judge.judge_name).toBe('Alice');
    expect(result.current.groups[0].rows.map(r => r.item_label)).toEqual(['Pen', 'Water']);
    expect(result.current.groups[1].judge.judge_name).toBe('Bob');
    expect(result.current.groups[1].judge.person_id).toBeNull();
  });

  it('sorts rows within a group by sort_order ascending', async () => {
    mockService.listForTrial.mockResolvedValue([
      row({ id: 'a', person_id: 'p1', judge_name: 'Alice', sort_order: 30, item_label: 'Last' }),
      row({ id: 'b', person_id: 'p1', judge_name: 'Alice', sort_order: 10, item_label: 'First' }),
      row({ id: 'c', person_id: 'p1', judge_name: 'Alice', sort_order: 20, item_label: 'Middle' }),
    ]);

    const { result } = renderHook(() => useTrialJudgeSupplies('trial-1'), {
      wrapper: wrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.groups[0].rows.map(r => r.item_label)).toEqual([
      'First',
      'Middle',
      'Last',
    ]);
  });

  it('ensureSeeded mutation calls the service and invalidates the query', async () => {
    mockService.listForTrial.mockResolvedValue([]);
    mockService.ensureSeededForJudge.mockResolvedValue([
      row({ id: 'seeded', person_id: 'p1', judge_name: 'Alice' }),
    ]);

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useTrialJudgeSupplies('trial-1'), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.ensureSeeded.mutateAsync({
      person_id: 'p1',
      judge_name: 'Alice',
      registry_id: 'AKC',
    });

    expect(mockService.ensureSeededForJudge).toHaveBeenCalledWith({
      trial_id: 'trial-1',
      person_id: 'p1',
      judge_name: 'Alice',
      registry_id: 'AKC',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['trial-judge-supplies', 'trial-1'],
    });
  });

  it('updateRow mutation calls the service with the id + patch', async () => {
    mockService.listForTrial.mockResolvedValue([]);
    mockService.updateRow.mockResolvedValue(row({ id: 'r1', included: false }));

    const { result } = renderHook(() => useTrialJudgeSupplies('trial-1'), {
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

  it('addCustomRow mutation forwards trial_id from the hook', async () => {
    mockService.listForTrial.mockResolvedValue([]);
    mockService.addCustomRow.mockResolvedValue(
      row({ id: 'new', item_label: 'Phone charger', is_custom: true })
    );

    const { result } = renderHook(() => useTrialJudgeSupplies('trial-1'), {
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
      trial_id: 'trial-1',
      person_id: 'p1',
      judge_name: 'Alice',
      item_label: 'Phone charger',
      sort_order: 1000,
    });
  });

  it('deleteCustomRow mutation calls the service with the id', async () => {
    mockService.listForTrial.mockResolvedValue([]);
    mockService.deleteCustomRow.mockResolvedValue(undefined);

    const { result } = renderHook(() => useTrialJudgeSupplies('trial-1'), {
      wrapper: wrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.deleteCustomRow.mutateAsync('r1');
    expect(mockService.deleteCustomRow).toHaveBeenCalledWith('r1');
  });
});
