// apps/myk9show/src/hooks/queries/__tests__/useAKCSubmissionData.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAKCSubmissionData } from '../useAKCSubmissionData';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'auth-user-1' } }),
}));

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAKCSubmissionData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null data when showId is empty', () => {
    const { result } = renderHook(() => useAKCSubmissionData(''), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('maps dogs.sex Male to dogGender D', async () => {
    // Arrange: show + club
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'shows') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'show-1',
              name: 'Spring Trial',
              club_id: 'club-1',
              clubs: { name: 'Acme Club' },
            },
            error: null,
          }),
        };
      }
      if (table === 'people') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { first_name: 'Jane', last_name: 'Sec', email: 'jane@example.com' },
            error: null,
          }),
          in: vi.fn().mockReturnThis(),
        };
      }
      if (table === 'trials') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'trial-1',
                event_number: 'EV001',
                date: '2026-05-10',
                trial_number: '1',
                name: 'Trial 1',
              },
            ],
            error: null,
          }),
        };
      }
      if (table === 'classes') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'class-1',
                element: 'Container',
                level: 'Novice',
                section: 'A',
                time_limit_seconds: 120,
                trial_id: 'trial-1',
                name: 'Novice A Container',
              },
            ],
            error: null,
          }),
        };
      }
      if (table === 'entries') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'entry-1',
                dog_id: 'dog-1',
                class_id: 'class-1',
                trial_id: 'trial-1',
                armband: '101',
                search_time_seconds: 14.5,
                final_placement: 1,
                result_status: null,
                entry_status: 'accepted',
                check_in_status: 'present',
                run_order: 1,
              },
            ],
            error: null,
          }),
        };
      }
      if (table === 'dogs') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'dog-1',
                akc_number: 'HP12345601',
                sex: 'Male',
                owner_id: 'owner-1',
                name: 'Fluffy',
              },
            ],
            error: null,
          }),
        };
      }
      if (table === 'dog_registrations') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ dog_id: 'dog-1', registered_name: 'Acme Fluffy The First' }],
            error: null,
          }),
        };
      }
      // owners (people by id)
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'owner-1',
              first_name: 'Alice',
              last_name: 'Owner',
              street_address: '123 Main',
              city: 'Columbus',
              state: 'OH',
              zip_code: '43215',
              country: 'US',
            },
          ],
          error: null,
        }),
      };
    });

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const entry = result.current.data?.entries[0];
    expect(entry?.dogGender).toBe('D');
  });

  it('maps dogs.sex Female to dogGender B', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'shows')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'show-1', name: 'T', club_id: null, clubs: null },
            error: null,
          }),
        };
      if (table === 'people')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          in: vi.fn().mockReturnThis(),
        };
      if (table === 'trials')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { id: 't1', event_number: null, date: '2026-05-10', trial_number: '1', name: 'T1' },
            ],
            error: null,
          }),
        };
      if (table === 'classes')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'c1',
                element: 'Buried',
                level: 'Novice',
                section: 'A',
                time_limit_seconds: 90,
                trial_id: 't1',
                name: 'N',
              },
            ],
            error: null,
          }),
        };
      if (table === 'entries')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'e1',
                dog_id: 'd1',
                class_id: 'c1',
                trial_id: 't1',
                armband: '102',
                search_time_seconds: 20,
                final_placement: null,
                result_status: 'Q',
                entry_status: 'accepted',
                check_in_status: 'present',
                run_order: 1,
              },
            ],
            error: null,
          }),
        };
      if (table === 'dogs')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'd1', akc_number: 'HP99', sex: 'Female', owner_id: null, name: 'Bella' }],
            error: null,
          }),
        };
      if (table === 'dog_registrations')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.entries[0]?.dogGender).toBe('B');
  });

  it('uses dog_registrations.registered_name for dogRegisteredName', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'shows')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'show-1', name: 'T', club_id: null, clubs: null },
            error: null,
          }),
        };
      if (table === 'people')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          in: vi.fn().mockReturnThis(),
        };
      if (table === 'trials')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { id: 't1', event_number: null, date: '2026-05-10', trial_number: '1', name: 'T1' },
            ],
            error: null,
          }),
        };
      if (table === 'classes')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'c1',
                element: 'Container',
                level: 'Novice',
                section: 'A',
                time_limit_seconds: 90,
                trial_id: 't1',
                name: 'N',
              },
            ],
            error: null,
          }),
        };
      if (table === 'entries')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'e1',
                dog_id: 'd1',
                class_id: 'c1',
                trial_id: 't1',
                armband: '101',
                search_time_seconds: 10,
                final_placement: null,
                result_status: 'Q',
                entry_status: 'accepted',
                check_in_status: 'present',
                run_order: 1,
              },
            ],
            error: null,
          }),
        };
      if (table === 'dogs')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'd1', akc_number: 'HP99', sex: 'Male', owner_id: null, name: 'CallName' }],
            error: null,
          }),
        };
      if (table === 'dog_registrations')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ dog_id: 'd1', registered_name: 'Registered Name Here' }],
            error: null,
          }),
        };
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.entries[0]?.dogRegisteredName).toBe('Registered Name Here');
  });
});
