import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import { notifications } from '@/lib/notifications';
import type { ClassAssignment } from '@/types/volunteer';
import {
  classesNeedingAssignment,
  useAddVolunteerAndAssign,
  useAssignToClasses,
} from '../volunteerStewardQueries';

const SHOW_ID = 'show-1';

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const assignment = (over: Partial<ClassAssignment>): ClassAssignment => ({
  id: 'a-1',
  volunteerId: 'vol-1',
  classId: 'class-1',
  roleName: 'Table Steward',
  status: 'assigned',
  notes: null,
  createdAt: '',
  volunteerName: 'Sarah Miller',
  ...over,
});

describe('classesNeedingAssignment', () => {
  it('skips classes where the person already has this job, and repeated ids', () => {
    const existing = [
      assignment({ classId: 'class-1' }),
      assignment({ id: 'a-2', classId: 'class-2', roleName: 'Timer' }),
      assignment({ id: 'a-3', classId: 'class-3', volunteerId: 'vol-2' }),
    ];
    expect(
      classesNeedingAssignment(
        ['class-1', 'class-2', 'class-3', 'class-3'],
        'vol-1',
        'Table Steward',
        existing
      )
    ).toEqual(['class-2', 'class-3']);
  });
});

describe('useAssignToClasses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts one row per class still needing the job, in one write', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(queryKeys.volunteerClassAssignments(SHOW_ID), [
      assignment({ classId: 'class-1' }),
    ]);

    const { result } = renderHook(() => useAssignToClasses(SHOW_ID), { wrapper });
    let count: number | undefined;
    await act(async () => {
      count = await result.current.mutateAsync({
        volunteerId: 'vol-1',
        roleName: 'Table Steward',
        classIds: ['class-1', 'class-2', 'class-3'],
      });
    });

    expect(supabase.from).toHaveBeenCalledWith('volunteer_class_assignments');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([
      { volunteer_id: 'vol-1', class_id: 'class-2', role_name: 'Table Steward' },
      { volunteer_id: 'vol-1', class_id: 'class-3', role_name: 'Table Steward' },
    ]);
    expect(count).toBe(2);
  });

  it('writes nothing when every class already has them in this job', async () => {
    const insert = vi.fn();
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(queryKeys.volunteerClassAssignments(SHOW_ID), [
      assignment({ classId: 'class-1' }),
    ]);

    const { result } = renderHook(() => useAssignToClasses(SHOW_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        volunteerId: 'vol-1',
        roleName: 'Table Steward',
        classIds: ['class-1'],
      });
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('says nothing was changed when the write fails', async () => {
    const error = vi.spyOn(notifications, 'error');
    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: new Error('denied') }),
    } as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useAssignToClasses(SHOW_ID), { wrapper });
    act(() => {
      result.current.mutate({ volunteerId: 'vol-1', roleName: 'Timer', classIds: ['class-1'] });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(error).toHaveBeenCalledWith(
      "We couldn't assign this steward to the classes. Nothing was changed. Try again."
    );
  });
});

describe('useAddVolunteerAndAssign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds the name as a walk-up on this show, then gives the new volunteer the job', async () => {
    const volunteerInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'vol-new' }, error: null }),
      }),
    });
    const assignInsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockImplementation(
      (table: string) =>
        ({
          insert: table === 'volunteers' ? volunteerInsert : assignInsert,
        }) as never
    );
    const { queryClient, wrapper } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAddVolunteerAndAssign(SHOW_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        name: 'Pat Lee',
        classId: 'class-1',
        roleName: 'Gate Steward',
      });
    });

    expect(volunteerInsert).toHaveBeenCalledWith({
      name: 'Pat Lee',
      show_id: SHOW_ID,
      phone: null,
      notes: null,
      person_id: null,
    });
    expect(assignInsert).toHaveBeenCalledWith({
      volunteer_id: 'vol-new',
      class_id: 'class-1',
      role_name: 'Gate Steward',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.volunteers(SHOW_ID) });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.volunteerClassAssignments(SHOW_ID),
    });
  });
});
