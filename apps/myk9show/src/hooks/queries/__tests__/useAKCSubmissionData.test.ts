// apps/myk9show/src/hooks/queries/__tests__/useAKCSubmissionData.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAKCSubmissionData } from '../useAKCSubmissionData';
import { AKCScentWorkFormatter, mapAKCClassCodes } from '@myk9/secretary';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'auth-user-1' } }),
}));

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }));
const mockGetArmbandsByShow = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: mockGetArmbandsByShow },
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
    mockGetArmbandsByShow.mockResolvedValue([]);
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
      if (table === 'view_authenticated_entry_results') {
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
                armband: '0',
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

    mockGetArmbandsByShow.mockResolvedValue([
      { showId: 'show-1', dogId: 'dog-1', armbandNumber: '12A' },
    ]);

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const entry = result.current.data?.entries[0];
    expect(entry?.dogGender).toBe('D');
    expect(entry?.armbandNumber).toBe('12A');
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
      if (table === 'view_authenticated_entry_results')
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
                armband: '12A',
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
            data: [{ id: 'd1', sex: 'Female', owner_id: null, name: 'Bella', call_name: 'Bella' }],
            error: null,
          }),
        };
      if (table === 'dog_registrations')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.entries[0]?.dogGender).toBe('B');
    expect(result.current.data?.entries[0]?.armbandNumber).toBe('12A');
  });

  it('uses dog_registrations.registered_name for dogRegisteredName', async () => {
    const registrationSelect = vi.fn().mockReturnThis();

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
      if (table === 'view_authenticated_entry_results')
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
            data: [{ id: 'd1', sex: 'Male', owner_id: null, name: 'CallName', call_name: 'Call' }],
            error: null,
          }),
        };
      if (table === 'dog_registrations')
        return {
          select: registrationSelect,
          in: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'reg-long',
                dog_id: 'd1',
                created_at: '2025-06-01T11:59:58.000Z',
                // Long-form spelling — the drift that the old
                // `.eq('organization', 'AKC')` filter silently missed.
                organization: 'AKC (American Kennel Club)',
                is_primary: false,
                registration_number: 'HP12345601',
                registered_name: 'Registered Name Here',
                breed: 'Labrador Retriever',
                variety: null,
              },
              {
                id: 'reg-primary',
                dog_id: 'd1',
                created_at: '2025-06-01T12:00:00.000Z',
                is_primary: true,
                organization: 'AKC',
                registration_number: 'HP12345602',
                registered_name: 'Primary Registered Name',
                breed: 'Labrador Retriever',
                variety: null,
              },
              {
                id: 'reg-ukc',
                dog_id: 'd1',
                created_at: '2025-06-01T12:00:01.000Z',
                is_primary: false,
                organization: 'UKC (United Kennel Club)',
                registration_number: 'P-999',
                registered_name: 'Some Other Name',
                breed: 'Retriever (Labrador)',
                variety: null,
              },
            ],
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

    const entry = result.current.data?.entries[0];
    expect(entry?.dogRegisteredName).toBe('Primary Registered Name');
    // MYK9-90 regression (tasks 3.1 / 8.3.1). Before this change the hook read
    // `dogs.akc_number` — a column nothing writes and that is NULL for every
    // row — so every AKC submission carried a blank registration number.
    expect(entry?.registrationNumber).toBe('HP12345602');
    // Breed comes from the AKC registration, not the hardcoded 'Unknown'
    // placeholder, and NOT from the dog's UKC registration.
    expect(entry?.breed).toBe('Labrador Retriever');
    expect(entry?.registrationNumber).not.toBe('P-999');
    expect(registrationSelect).toHaveBeenCalledWith(
      'dog_id, id, created_at, is_primary, organization, registration_number, registered_name, breed, variety'
    );
  });

  it('emits no registration number or breed for a dog with no AKC registration', async () => {
    // A UKC-only dog must not have its UKC number or breed borrowed onto an AKC
    // submission — a wrong number on paperwork is worse than a blank field.
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
      if (table === 'view_authenticated_entry_results')
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
            data: [{ id: 'd1', sex: 'Male', owner_id: null, name: 'Rex', call_name: 'Rex' }],
            error: null,
          }),
        };
      if (table === 'dog_registrations')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [
              {
                dog_id: 'd1',
                organization: 'UKC (United Kennel Club)',
                registration_number: 'P-999',
                registered_name: 'Rex Of Somewhere',
                breed: 'Retriever (Labrador)',
                variety: null,
              },
            ],
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

    const entry = result.current.data?.entries[0];
    expect(entry?.registrationNumber).toBeNull();
    expect(entry?.dogRegisteredName).toBeNull();
    // Empty, never 'Unknown' or any other substitute.
    expect(entry?.breed).toBe('');
  });
  it('carries a Detective class through with element set and level empty (MYK9-547)', async () => {
    // `classes.level` is NULL for Detective — it is a standalone element. The
    // adapter coalesces that to '', so anything downstream that classifies on
    // `level` alone sees a blank. This pins the SHAPE the formatter receives
    // and then runs the real formatter over it, because a unit test on the
    // mapper alone cannot see a field dropped at the last hop.
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
              {
                id: 't1',
                event_number: '2026193001',
                date: '2026-05-10',
                trial_number: '1',
                name: 'T1',
              },
            ],
            error: null,
          }),
        };
      if (table === 'classes')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            // The live `sport_class_rules` / `classes` shape for Detective.
            data: [
              {
                id: 'c1',
                element: 'Detective',
                level: null,
                section: null,
                time_limit_seconds: 600,
                trial_id: 't1',
                name: 'Detective',
              },
            ],
            error: null,
          }),
        };
      if (table === 'view_authenticated_entry_results')
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
                search_time_seconds: 300,
                final_placement: 1,
                result_status: 'qualified',
                entry_status: 'completed',
                check_in_status: 'completed',
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
            data: [{ id: 'd1', sex: 'Male', owner_id: null, name: 'Rex', call_name: 'Rex' }],
            error: null,
          }),
        };
      if (table === 'dog_registrations')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [
              {
                dog_id: 'd1',
                organization: 'AKC (American Kennel Club)',
                registration_number: 'HP12345601',
                registered_name: 'Rex Of Somewhere',
                breed: 'Retriever (Labrador)',
                variety: null,
              },
            ],
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

    const entry = result.current.data?.entries[0];
    expect(entry?.element).toBe('Detective');
    expect(entry?.level).toBe('');
    expect(entry?.section).toBeNull();
    expect(mapAKCClassCodes(entry!.element, entry!.level, entry!.section)).toEqual({
      primaryClass: 'SWDC',
      secondaryClass: null,
    });

    const xml = AKCScentWorkFormatter.formatXml(result.current.data!);
    expect(xml).toContain('primaryClass="SWDC"');
    expect(xml).not.toContain('primaryClass="SWNOVA"');
    expect(xml).not.toContain('secondaryClass=');
  });
});
