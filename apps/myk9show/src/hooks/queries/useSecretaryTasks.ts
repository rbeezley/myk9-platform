import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/supabase';
import type {
  SecretaryTask,
  CreateTaskInput,
  UpdateTaskInput,
} from '@/pages/secretary/SecretaryDashboardPage/types';

const TASKS_KEY = 'secretary-tasks';

function toTask(row: Tables<'secretary_tasks'>): SecretaryTask {
  const task: SecretaryTask = {
    id: row.id,
    clubId: row.club_id,
    showId: row.show_id,
    title: row.title,
    status: row.status as SecretaryTask['status'],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.description != null) task.description = row.description;
  if (row.priority != null) task.priority = row.priority as NonNullable<SecretaryTask['priority']>;
  if (row.due_date != null) task.dueDate = row.due_date;
  if (row.assignee_id != null) task.assigneeId = row.assignee_id;
  return task;
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
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId;
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      if (!personId) throw new Error('Not authenticated');
      const payload: TablesInsert<'secretary_tasks'> = {
        club_id: input.clubId,
        show_id: input.showId ?? null,
        title: input.title,
        priority: input.priority ?? null,
        due_date: input.dueDate ?? null,
        assignee_id: input.assigneeId ?? null,
        created_by: personId,
      };
      const { data, error } = await supabase
        .from('secretary_tasks')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return toTask(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TASKS_KEY] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: UpdateTaskInput }) => {
      const payload: TablesUpdate<'secretary_tasks'> = {};
      if (update.title !== undefined) payload.title = update.title;
      if (update.status !== undefined) payload.status = update.status;
      if (update.priority !== undefined) payload.priority = update.priority;
      if (update.dueDate !== undefined) payload.due_date = update.dueDate;
      if (update.assigneeId !== undefined) payload.assignee_id = update.assigneeId;
      if (update.showId !== undefined) payload.show_id = update.showId;
      const { error } = await supabase.from('secretary_tasks').update(payload).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, update }) => {
      await qc.cancelQueries({ queryKey: [TASKS_KEY] });
      const previous = qc.getQueriesData<SecretaryTask[]>({ queryKey: [TASKS_KEY] });
      qc.setQueriesData<SecretaryTask[]>({ queryKey: [TASKS_KEY] }, (old = []) =>
        old.map(t =>
          t.id === id
            ? {
                ...t,
                ...(update.title !== undefined && { title: update.title }),
                ...(update.status !== undefined && { status: update.status }),
                ...(update.priority !== undefined && { priority: update.priority }),
                ...(update.dueDate !== undefined && { dueDate: update.dueDate }),
                ...(update.assigneeId !== undefined && { assigneeId: update.assigneeId }),
                ...(update.showId !== undefined && { showId: update.showId }),
              }
            : t
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [TASKS_KEY] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('secretary_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async id => {
      await qc.cancelQueries({ queryKey: [TASKS_KEY] });
      const previous = qc.getQueriesData<SecretaryTask[]>({ queryKey: [TASKS_KEY] });
      qc.setQueriesData<SecretaryTask[]>({ queryKey: [TASKS_KEY] }, (old = []) =>
        old.filter(t => t.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [TASKS_KEY] }),
  });
}
