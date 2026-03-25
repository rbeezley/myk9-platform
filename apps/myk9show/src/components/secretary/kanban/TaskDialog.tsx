import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { KanbanTask, TaskPriority } from './kanban-types';

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (task: Partial<KanbanTask>) => void;
  task?: KanbanTask | null;
}

export function TaskDialog({ open, onOpenChange, onSave, task }: TaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open && task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority || '');
      setDueDate(task.dueDate || '');
      setAssignee(task.assignee || '');
    } else if (open) {
      setTitle('');
      setDescription('');
      setPriority('');
      setDueDate('');
      setAssignee('');
    }
  }, [open, task]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const data: Partial<KanbanTask> = {
      title: title.trim(),
      status: task?.status || 'todo',
    };
    if (description.trim()) data.description = description.trim();
    if (priority) data.priority = priority;
    if (dueDate) data.dueDate = dueDate;
    if (assignee.trim()) data.assignee = assignee.trim();
    onSave(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter task title"
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add more details (optional)"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority | '')}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Due Date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-assignee">Assignee</Label>
            <Input
              id="task-assignee"
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              placeholder="Who's responsible?"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              {task ? 'Save Changes' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
