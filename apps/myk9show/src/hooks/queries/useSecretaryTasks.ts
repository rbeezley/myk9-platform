import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import type {
  SecretaryTask,
  CreateTaskInput,
  UpdateTaskInput,
} from '@/pages/secretary/SecretaryDashboardPage/types';

const TASKS_KEY = 'secretary-tasks';

function toTask(row: Record<string, unknown>): SecretaryTask {
  return {
    id: row.id as string,
    clubId: row.club_id as string,
    showId: row.show_id as string | null,
    title: row.title as string,
    description: row.description as string | undefined,
    status: row.status as 'todo' | 'done',
    priority: row.priority as SecretaryTask['priority'],
    dueDate: row.due_date as string | null,
    assigneeId: row.assignee_id as string | null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function useSecretaryTasks(showIdFilter?: string) {
  return useQuery({
    queryKey: [TASKS_KEY, showIdFilter ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('secretary_tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false });

      if (showIdFilter && showIdFilter !== 'all') {
        if (showIdFilter === 'general') {
          query = query.is('show_id', null);
        } else {
          query = query.eq('show_id', showIdFilter);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(toTask);
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const { data, error } = await supabase
        .from('secretary_tasks')
        .insert({
          club_id: input.clubId,
          show_id: input.showId ?? null,
          title: input.title,
          priority: input.priority ?? null,
          due_date: input.dueDate ?? null,
          assignee_id: input.assigneeId ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return toTask(data as Record<string, unknown>);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TASKS_KEY] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: UpdateTaskInput }) => {
      const { error } = await supabase
        .from('secretary_tasks')
        .update({
          ...(update.title !== undefined && { title: update.title }),
          ...(update.status !== undefined && { status: update.status }),
          ...(update.priority !== undefined && { priority: update.priority }),
          ...(update.dueDate !== undefined && { due_date: update.dueDate }),
          ...(update.assigneeId !== undefined && { assignee_id: update.assigneeId }),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TASKS_KEY] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('secretary_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TASKS_KEY] }),
  });
}
