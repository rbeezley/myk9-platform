export interface SecretaryTask {
  id: string;
  clubId: string;
  showId: string | null;
  title: string;
  description?: string;
  status: 'todo' | 'done';
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string | null;
  assigneeId?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateTaskInput = Pick<
  SecretaryTask,
  'title' | 'showId' | 'priority' | 'dueDate' | 'assigneeId'
> & {
  clubId: string;
};

export type UpdateTaskInput = Partial<
  Pick<SecretaryTask, 'title' | 'status' | 'priority' | 'dueDate' | 'assigneeId' | 'showId'>
>;
