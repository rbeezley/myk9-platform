// MYK9-977 — an entry with no armband must reach the AKC submission as null,
// never as armband 0 (which AKC would record as a real catalog number).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAKCSubmissionData } from '../useAKCSubmissionData';
import { AKCScentWorkFormatter, countMissingArmbandAKCEntries } from '@myk9/secretary';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'auth-user-1' } }),
}));

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: mockSupabase }));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

const chain = (terminal: Record<string, unknown>) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  ...terminal,
});

function entryRow(id: string, armband: string | null, status = 'qualified') {
  return {
    id,
    dog_id: 'dog-1',
    class_id: 'class-1',
    trial_id: 'trial-1',
    armband,
    search_time_seconds: 14.5,
    final_placement: null,
    result_status: status,
    entry_status: 'confirmed',
    check_in_status: 'no-status',
    run_order: 1,
  };
}

function mockTables(entries: ReturnType<typeof entryRow>[]) {
  mockSupabase.from.mockImplementation((table: string) => {
    switch (table) {
      case 'shows':
        return chain({
          single: vi.fn().mockResolvedValue({
            data: { id: 'show-1', name: 'T', club_id: null, clubs: null },
            error: null,
          }),
        });
      case 'people':
        return chain({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
      case 'trials':
        return chain({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'trial-1',
                event_number: null,
                date: '2026-05-10',
                trial_number: '1',
                name: 'T1',
              },
            ],
            error: null,
          }),
        });
      case 'classes':
        return chain({
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'class-1',
                element: 'Buried',
                level: 'Novice',
                section: 'A',
                time_limit_seconds: 90,
                trial_id: 'trial-1',
                name: 'Novice A Buried',
              },
            ],
            error: null,
          }),
        });
      case 'view_authenticated_entry_results':
        return chain({ is: vi.fn().mockResolvedValue({ data: entries, error: null }) });
      case 'dog_registrations':
        return chain({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) });
      default:
        // dogs, owners
        return chain({
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'dog-1', sex: 'Male', owner_id: null, name: 'Fluffy' }],
            error: null,
          }),
        });
    }
  });
}

describe('useAKCSubmissionData — armband (MYK9-977)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carries a missing armband as null and never emits catalogNumber 0', async () => {
    mockTables([entryRow('e-null', null), entryRow('e-101', '101')]);

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.entries.map(e => e.armbandNumber).sort()).toEqual([101, null]);
    expect(countMissingArmbandAKCEntries(data.entries)).toBe(1);

    const xml = AKCScentWorkFormatter.formatXml(data);
    expect(xml).not.toContain('catalogNumber="0"');
    expect(xml).toContain('catalogNumber="101"');
  });
});
