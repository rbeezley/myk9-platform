import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import {
  useSecretaryTasks,
  useCreateTask,
  useUpdateTask as _useUpdateTask,
  useDeleteTask as _useDeleteTask,
} from '../useSecretaryTasks';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((msg: string) => new Error(msg)),
}));

const authState = vi.hoisted(() => ({
  userWithRoles: { databaseUserId: 'person-1' } as { databaseUserId: string | undefined } | null,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: authState.userWithRoles }),
}));

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

const mockTask = {
  id: 'task-1',
  club_id: 'club-1',
  show_id: 'show-1',
  title: 'Print scoresheets',
  description: null,
  status: 'todo',
  priority: 'high',
  due_date: '2026-04-16',
  assignee_id: null,
  created_by: 'user-1',
  created_at: '2026-04-16T00:00:00Z',
  updated_at: '2026-04-16T00:00:00Z',
};

describe('useSecretaryTasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches tasks and returns them', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [mockTask], error: null }),
      }),
    });

    const { result } = renderHook(() => useSecretaryTasks(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].title).toBe('Print scoresheets');
  });

  it('filters by showId when provided', async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: [mockTask], error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({ eq: eqMock }),
      }),
    });

    const { result } = renderHook(() => useSecretaryTasks('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eqMock).toHaveBeenCalledWith('show_id', 'show-1');
  });

  it('filters show_id IS NULL when showIdFilter is "general"', async () => {
    const isMock = vi.fn().mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({ is: isMock }),
      }),
    });

    const { result } = renderHook(() => useSecretaryTasks('general'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(isMock).toHaveBeenCalledWith('show_id', null);
  });
});

describe('useCreateTask', () => {
  beforeEach(() => {
    authState.userWithRoles = { databaseUserId: 'person-1' };
  });

  it('inserts a task with created_by and invalidates the query', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: mockTask, error: null });
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: singleMock }),
    });
    mockFrom.mockReturnValue({ insert: insertMock });

    const { result } = renderHook(() => useCreateTask(), { wrapper });
    await result.current.mutateAsync({
      clubId: 'club-1',
      showId: 'show-1',
      title: 'New task',
    });

    expect(singleMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        club_id: 'club-1',
        show_id: 'show-1',
        title: 'New task',
        created_by: 'person-1',
      })
    );
  });

  it('throws "Not authenticated" when no databaseUserId is present', async () => {
    authState.userWithRoles = null;
    const insertMock = vi.fn();
    mockFrom.mockReturnValue({ insert: insertMock });

    const { result } = renderHook(() => useCreateTask(), { wrapper });
    await expect(
      result.current.mutateAsync({ clubId: 'club-1', showId: 'show-1', title: 'x' })
    ).rejects.toThrow('Not authenticated');
    expect(insertMock).not.toHaveBeenCalled();
  });
});
