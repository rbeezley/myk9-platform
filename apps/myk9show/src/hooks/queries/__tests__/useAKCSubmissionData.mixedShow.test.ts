// apps/myk9show/src/hooks/queries/__tests__/useAKCSubmissionData.mixedShow.test.ts

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAKCSubmissionData } from '../useAKCSubmissionData';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'auth-user-1' } }),
}));

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

const chain = () => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
});

const trialRows = [
  {
    id: 'trial-sw',
    event_number: 'EV1',
    date: '2026-05-10',
    trial_number: '1',
    name: 'SW',
    trial_type: 'Scent Work',
  },
  {
    id: 'trial-fc',
    event_number: 'EV2',
    date: '2026-05-11',
    trial_number: '2',
    name: 'FC',
    trial_type: 'FastCAT',
  },
];

const allClasses = [
  {
    id: 'c-sw',
    element: 'Buried',
    level: 'Novice',
    section: 'A',
    time_limit_seconds: 120,
    trial_id: 'trial-sw',
    name: 'Novice Buried',
  },
  {
    id: 'c-fc',
    element: 'FastCAT',
    level: 'Open',
    section: null,
    time_limit_seconds: null,
    trial_id: 'trial-fc',
    name: 'FastCAT 100 yd',
  },
];

const entryRow = (id: string, classId: string, trialId: string) => ({
  id,
  dog_id: 'dog-1',
  class_id: classId,
  trial_id: trialId,
  armband: '101',
  search_time_seconds: 10,
  final_placement: 1,
  result_status: 'Q',
  entry_status: 'accepted',
  check_in_status: 'present',
  run_order: 1,
});

describe('useAKCSubmissionData: mixed Scent Work and FastCAT show (MYK9-2157)', () => {
  it('exports only Scent Work trials and entries, and is not blocked by FastCAT', async () => {
    const classTrialIds: string[][] = [];
    mockSupabase.from.mockImplementation((table: string) => {
      switch (table) {
        case 'shows':
          return {
            ...chain(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'show-1', name: 'Mixed', club_id: null, clubs: null },
              error: null,
            }),
          };
        case 'people':
          return {
            ...chain(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        case 'trials':
          return {
            ...chain(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: trialRows, error: null }),
          };
        case 'classes':
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn((_col: string, ids: string[]) => {
              classTrialIds.push(ids);
              return {
                is: vi.fn().mockResolvedValue({
                  data: allClasses.filter(c => ids.includes(c.trial_id)),
                  error: null,
                }),
              };
            }),
          };
        case 'view_authenticated_entry_results':
          return {
            ...chain(),
            is: vi.fn().mockResolvedValue({
              data: [entryRow('e-sw', 'c-sw', 'trial-sw'), entryRow('e-fc', 'c-fc', 'trial-fc')],
              error: null,
            }),
          };
        case 'dogs':
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'dog-1', sex: 'Male', owner_id: null, name: 'Rex', call_name: 'Rex' }],
              error: null,
            }),
          };
        default:
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
      }
    });

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.trials.map(t => t.id)).toEqual(['trial-sw']);
    expect(classTrialIds).toEqual([['trial-sw']]);
    expect(result.current.data?.entries.map(e => e.classId)).toEqual(['c-sw']);
  });

  it('returns an empty export, not an error, when the show has only FastCAT trials', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'shows')
        return {
          ...chain(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'show-1', name: 'FC only', club_id: null, clubs: null },
            error: null,
          }),
        };
      if (table === 'trials')
        return {
          ...chain(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [trialRows[1]], error: null }),
        };
      if (table === 'view_authenticated_entry_results')
        return {
          ...chain(),
          is: vi
            .fn()
            .mockResolvedValue({ data: [entryRow('e-fc', 'c-fc', 'trial-fc')], error: null }),
        };
      return {
        ...chain(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.trials).toEqual([]);
    expect(result.current.data?.entries).toEqual([]);
  });
});
