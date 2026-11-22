import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import { notifications } from '@/lib/notifications';
import type { ClassAssignment } from '@/types/volunteer';
import { classesNeedingAssignment, useAssignToClasses } from '../volunteerStewardQueries';

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
    const success = vi.spyOn(notifications, 'success');
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'n-1' }, { id: 'n-2' }], error: null });
    const upsert = vi.fn().mockReturnValue({ select });
    vi.mocked(supabase.from).mockReturnValue({ upsert } as never);
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(queryKeys.volunteerClassAssignments(SHOW_ID), [
      assignment({ classId: 'class-1' }),
    ]);

    const { result } = renderHook(() => useAssignToClasses(SHOW_ID), { wrapper });
    let count: number | undefined;
    await act(async () => {
      count = await result.current.mutateAsync({
        volunteerId: 'vol-1',
        volunteerName: 'Sarah Miller',
        roleName: 'Table Steward',
        classIds: ['class-1', 'class-2', 'class-3'],
      });
    });

    expect(supabase.from).toHaveBeenCalledWith('volunteer_class_assignments');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      [
        { volunteer_id: 'vol-1', class_id: 'class-2', role_name: 'Table Steward' },
        { volunteer_id: 'vol-1', class_id: 'class-3', role_name: 'Table Steward' },
      ],
      // A row another device added since the last read is skipped, not a failed batch.
      { onConflict: 'volunteer_id,class_id,role_name', ignoreDuplicates: true }
    );
    expect(count).toBe(2);
    // The hook, not the dialog, confirms, so a dialog closed mid-save still gets the toast.
    expect(success).toHaveBeenCalledWith('Sarah Miller is Table Steward for 2 classes.');
  });

  it('writes nothing when every class already has them in this job', async () => {
    vi.spyOn(notifications, 'success');
    const upsert = vi.fn();
    vi.mocked(supabase.from).mockReturnValue({ upsert } as never);
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(queryKeys.volunteerClassAssignments(SHOW_ID), [
      assignment({ classId: 'class-1' }),
    ]);

    const { result } = renderHook(() => useAssignToClasses(SHOW_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        volunteerId: 'vol-1',
        volunteerName: 'Sarah Miller',
        roleName: 'Table Steward',
        classIds: ['class-1'],
      });
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(notifications.success).toHaveBeenCalledWith(
      'Sarah Miller already had this job in those classes.'
    );
  });

  it('says nothing was changed when the write fails', async () => {
    const error = vi.spyOn(notifications, 'error');
    const upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('denied') }),
    });
    vi.mocked(supabase.from).mockReturnValue({ upsert } as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useAssignToClasses(SHOW_ID), { wrapper });
    act(() => {
      result.current.mutate({
        volunteerId: 'vol-1',
        volunteerName: 'Sarah Miller',
        roleName: 'Timer',
        classIds: ['class-1'],
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(error).toHaveBeenCalledWith(
      "We couldn't assign this steward to the classes. Nothing was changed. Try again."
    );
    // No retry: a lost response would otherwise send the batch twice.
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
