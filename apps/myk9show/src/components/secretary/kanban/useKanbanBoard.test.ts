import { renderHook, act } from '@testing-library/react';
import { useKanbanBoard } from './useKanbanBoard';

describe('useKanbanBoard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with empty tasks', () => {
    const { result } = renderHook(() => useKanbanBoard('show-1'));
    expect(result.current.tasks).toEqual([]);
  });

  it('adds a task', () => {
    const { result } = renderHook(() => useKanbanBoard('show-1'));

    act(() => {
      result.current.addTask({ title: 'Test task', status: 'todo' });
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe('Test task');
    expect(result.current.tasks[0].status).toBe('todo');
    expect(result.current.tasks[0].id).toBeTruthy();
  });

  it('updates a task', () => {
    const { result } = renderHook(() => useKanbanBoard('show-1'));

    act(() => {
      result.current.addTask({ title: 'Original', status: 'todo' });
    });

    const taskId = result.current.tasks[0].id;

    act(() => {
      result.current.updateTask(taskId, { title: 'Updated' });
    });

    expect(result.current.tasks[0].title).toBe('Updated');
  });

  it('deletes a task', () => {
    const { result } = renderHook(() => useKanbanBoard('show-1'));

    act(() => {
      result.current.addTask({ title: 'Delete me', status: 'todo' });
    });

    const taskId = result.current.tasks[0].id;

    act(() => {
      result.current.deleteTask(taskId);
    });

    expect(result.current.tasks).toHaveLength(0);
  });

  it('moves a task to a new status', () => {
    const { result } = renderHook(() => useKanbanBoard('show-1'));

    act(() => {
      result.current.addTask({ title: 'Move me', status: 'todo' });
    });

    const taskId = result.current.tasks[0].id;

    act(() => {
      result.current.moveTask(taskId, 'in-progress');
    });

    expect(result.current.tasks[0].status).toBe('in-progress');
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useKanbanBoard('show-1'));

    act(() => {
      result.current.addTask({ title: 'Persistent', status: 'todo' });
    });

    const stored = localStorage.getItem('myk9show-kanban-show-1');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].title).toBe('Persistent');
  });

  it('loads from localStorage', () => {
    const state = {
      tasks: [{ id: 'pre-1', title: 'Pre-existing', status: 'done', createdAt: '', updatedAt: '' }],
      lastModified: new Date().toISOString(),
    };
    localStorage.setItem('myk9show-kanban-show-2', JSON.stringify(state));

    const { result } = renderHook(() => useKanbanBoard('show-2'));
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe('Pre-existing');
  });

  it('scopes storage by showId', () => {
    const { result: result1 } = renderHook(() => useKanbanBoard('show-a'));
    const { result: result2 } = renderHook(() => useKanbanBoard('show-b'));

    act(() => {
      result1.current.addTask({ title: 'Show A task', status: 'todo' });
    });

    expect(result1.current.tasks).toHaveLength(1);
    expect(result2.current.tasks).toHaveLength(0);
  });
});
