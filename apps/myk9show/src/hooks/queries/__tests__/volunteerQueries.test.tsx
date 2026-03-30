import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import {
  useVolunteers,
  useSearchPeople,
  useVolunteerConflicts,
  useAddVolunteer,
  useAssignToClass,
  useUnassignFromClass,
  useAssignToGeneralDuty,
  useUnassignFromGeneralDuty,
} from '../volunteerQueries';

const SHOW_ID = 'show-1';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('volunteerQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useVolunteers', () => {
    it('returns empty array when no volunteers exist', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as never);

      const { result } = renderHook(() => useVolunteers(SHOW_ID), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    it('is disabled when showId is undefined', () => {
      const { result } = renderHook(() => useVolunteers(undefined), {
        wrapper: createWrapper(),
      });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useVolunteerConflicts', () => {
    it('returns empty map when no volunteers have personIds', async () => {
      const { result } = renderHook(
        () =>
          useVolunteerConflicts(SHOW_ID, [
            {
              id: 'vol-1',
              personId: null,
              name: 'Walk-up',
              phone: null,
              notes: null,
              isAvailable: true,
              showId: SHOW_ID,
              createdAt: '',
              updatedAt: '',
            },
          ]),
        { wrapper: createWrapper() }
      );

      // Query is disabled when no personIds — stays idle
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useSearchPeople', () => {
    it('is disabled when query is shorter than 2 characters', () => {
      const { result } = renderHook(() => useSearchPeople('a'), {
        wrapper: createWrapper(),
      });
      expect(result.current.fetchStatus).toBe('idle');
    });

    it('searches people when query is 2+ characters', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: 'p1', first_name: 'Sarah', last_name: 'Miller', phone: '555-1234' }],
              error: null,
            }),
          }),
        }),
      } as never);

      const { result } = renderHook(() => useSearchPeople('Sa'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([
        { id: 'p1', firstName: 'Sarah', lastName: 'Miller', phone: '555-1234' },
      ]);
    });
  });

  describe('useAddVolunteer', () => {
    it('calls supabase insert on volunteers', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'new-1',
                name: 'Test Vol',
                is_available: true,
                show_id: SHOW_ID,
                person_id: null,
                phone: null,
                notes: null,
                created_at: '',
                updated_at: '',
              },
              error: null,
            }),
          }),
        }),
      } as never);

      const { result } = renderHook(() => useAddVolunteer(), { wrapper: createWrapper() });

      await result.current.mutateAsync({
        name: 'Test Vol',
        showId: SHOW_ID,
        phone: null,
        notes: null,
        personId: null,
      });
      expect(supabase.from).toHaveBeenCalledWith('volunteers');
    });
  });

  describe('useAssignToClass', () => {
    it('calls supabase insert on volunteer_class_assignments', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'a-1',
                volunteer_id: 'v-1',
                class_id: 'c-1',
                role_name: 'Timer',
                status: 'assigned',
                notes: null,
                created_at: '',
              },
              error: null,
            }),
          }),
        }),
      } as never);

      const { result } = renderHook(() => useAssignToClass(SHOW_ID), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        volunteerId: 'v-1',
        classId: 'c-1',
        roleName: 'Timer',
      });
      expect(supabase.from).toHaveBeenCalledWith('volunteer_class_assignments');
    });
  });

  describe('useUnassignFromClass', () => {
    it('calls supabase delete on volunteer_class_assignments', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as never);

      const { result } = renderHook(() => useUnassignFromClass(SHOW_ID), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync('a-1');
      expect(supabase.from).toHaveBeenCalledWith('volunteer_class_assignments');
    });
  });

  describe('useAssignToGeneralDuty', () => {
    it('calls supabase insert on volunteer_general_assignments', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'ga-1',
                volunteer_id: 'v-1',
                show_id: SHOW_ID,
                role_name: 'Hospitality',
                shift_start: null,
                shift_end: null,
                status: 'assigned',
                notes: null,
                created_at: '',
              },
              error: null,
            }),
          }),
        }),
      } as never);

      const { result } = renderHook(() => useAssignToGeneralDuty(SHOW_ID), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        volunteerId: 'v-1',
        showId: SHOW_ID,
        roleName: 'Hospitality',
      });
      expect(supabase.from).toHaveBeenCalledWith('volunteer_general_assignments');
    });
  });

  describe('useUnassignFromGeneralDuty', () => {
    it('calls supabase delete on volunteer_general_assignments', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as never);

      const { result } = renderHook(() => useUnassignFromGeneralDuty(SHOW_ID), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync('ga-1');
      expect(supabase.from).toHaveBeenCalledWith('volunteer_general_assignments');
    });
  });
});
