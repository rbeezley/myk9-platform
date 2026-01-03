/**
 * Task Dialog Component
 *
 * Dialog for creating and editing Kanban tasks.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { KanbanTask, TaskPriority } from '../types';

interface TaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<KanbanTask>) => void;
  task?: KanbanTask | null;
}

export function TaskDialog({ isOpen, onClose, onSave, task }: TaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');

  // Reset form when dialog opens/closes or task changes - intentional setState in effect
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen && task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority || '');
      setDueDate(task.dueDate || '');
      setAssignee(task.assignee || '');
    } else if (isOpen) {
      setTitle('');
      setDescription('');
      setPriority('');
      setDueDate('');
      setAssignee('');
    }
  }, [isOpen, task]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      priority: priority || undefined,
      dueDate: dueDate || undefined,
      assignee: assignee.trim() || undefined,
      status: task?.status || 'todo',
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content task-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>{task ? 'Edit Task' : 'New Task'}</h2>
          <button className="dialog-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="dialog-body">
            <div className="form-group">
              <label htmlFor="task-title">Title *</label>
              <input
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter task title"
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="task-description">Description</label>
              <textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more details (optional)"
                rows={3}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="task-priority">Priority</label>
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority | '')}
                >
                  <option value="">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="task-due">Due Date</label>
                <input
                  id="task-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="task-assignee">Assignee</label>
              <input
                id="task-assignee"
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Who's responsible?"
              />
            </div>
          </div>

          <div className="dialog-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
              {task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
