import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { TaskRow } from '../TaskRow';
import { TasksTab, TASKS_TAB_RESERVED_MIN_HEIGHT_PX } from '../TasksTab';
import type { SecretaryTask } from '../types';

vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateTask: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateTask: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteTask: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { useSecretaryTasks, useUpdateTask, useDeleteTask } from '@/hooks/queries/useSecretaryTasks';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    MemoryRouter,
    null,
    React.createElement(QueryClientProvider, { client: createTestQueryClient() }, children)
  );
}

const makeTask = (overrides: Partial<SecretaryTask> = {}): SecretaryTask => ({
  id: 'task-1',
  clubId: 'club-1',
  showId: 'show-1',
  title: 'Print scoresheets',
  status: 'todo',
  priority: 'high',
  dueDate: new Date().toISOString().slice(0, 10),
  createdBy: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('TaskRow', () => {
  it('renders task title and show tag', () => {
    render(
      <TaskRow
        task={makeTask()}
        showName="Spring Trial"
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Print scoresheets')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
  });

  it('calls onToggleDone when checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(
      <TaskRow
        task={makeTask()}
        showName="Spring Trial"
        onToggleDone={onToggle}
        onDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('task-1');
  });

  it('shows strikethrough for done tasks', () => {
    const { container } = render(
      <TaskRow
        task={makeTask({ status: 'done' })}
        showName="Spring Trial"
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(container.querySelector('.line-through')).toBeInTheDocument();
  });
});

describe('TasksTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows "All Shows" chip selected by default', () => {
    render(<TasksTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} clubId="club-1" />, {
      wrapper,
    });
    const allChip = screen.getByText('All Shows');
    expect(allChip.closest('[aria-pressed]')).toHaveAttribute('aria-pressed', 'true');
  });

  it('pre-selects a show filter when initialFilter is passed', () => {
    render(
      <TasksTab
        shows={[{ id: 'show-1', name: 'Spring Trial' }]}
        clubId="club-1"
        initialFilter="show-1"
      />,
      { wrapper }
    );
    const showChip = screen.getByText('Spring Trial');
    expect(showChip.closest('[aria-pressed]')).toHaveAttribute('aria-pressed', 'true');
    const allChip = screen.getByText('All Shows');
    expect(allChip.closest('[aria-pressed]')).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters tasks when a show chip is clicked', async () => {
    render(<TasksTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} clubId="club-1" />, {
      wrapper,
    });
    fireEvent.click(screen.getByText('Spring Trial'));
    expect(screen.getByText('Spring Trial').closest('[aria-pressed]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('hides completed tasks by default and shows them on toggle', () => {
    const doneTask = makeTask({
      id: 'done-1',
      title: 'Old task',
      status: 'done',
      dueDate: undefined,
    });
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [doneTask],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });

    expect(screen.queryByText('Old task')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Show completed'));
    expect(screen.getByText('Old task')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Hide completed'));
    expect(screen.queryByText('Old task')).not.toBeInTheDocument();
  });

  it('sorts done tasks after open tasks', () => {
    const openTask = makeTask({
      id: 'open-1',
      title: 'Open task',
      status: 'todo',
      dueDate: undefined,
    });
    const doneTask = makeTask({
      id: 'done-1',
      title: 'Done task',
      status: 'done',
      dueDate: undefined,
    });
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [doneTask, openTask],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });

    fireEvent.click(screen.getByText('Show completed'));
    const items = screen.getAllByRole('checkbox');
    // open task checkbox should appear before done task checkbox
    expect(items[0]).not.toBeChecked();
    expect(items[1]).toBeChecked();
  });

  it('does not show raw show IDs for tasks whose show is unavailable', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [makeTask({ showId: '550e8400-e29b-41d4-a716-446655440000' })],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });

    expect(screen.getByText('Unknown show')).toBeInTheDocument();
    expect(screen.queryByText('550e8400-e29b-41d4-a716-446655440000')).not.toBeInTheDocument();
  });

  it('reserves min-height in the loading skeleton to prevent CLS', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });

    const skeleton = screen.getByTestId('tasks-tab-skeleton');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.style.minHeight).toBe(`${TASKS_TAB_RESERVED_MIN_HEIGHT_PX}px`);
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
  });

  it('does not render skeleton when data is loaded', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });

    expect(screen.queryByTestId('tasks-tab-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('No open tasks.')).toBeInTheDocument();
  });

  it('renders the List/Timeline view toggle', () => {
    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });
    expect(screen.getByLabelText('List view')).toBeInTheDocument();
    expect(screen.getByLabelText('Timeline view')).toBeInTheDocument();
  });

  it('starts in List view by default', () => {
    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });
    expect(screen.getByLabelText('List view')).toHaveClass('bg-primary');
  });

  it('switches to Timeline view when Timeline button is clicked', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [makeTask({ dueDate: new Date().toISOString().slice(0, 10) })],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} clubId="club-1" />, {
      wrapper,
    });

    fireEvent.click(screen.getByLabelText('Timeline view'));
    expect(screen.getByLabelText('Timeline view')).toHaveClass('bg-primary');
  });

  it('persists the timeline view preference to localStorage', () => {
    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });

    fireEvent.click(screen.getByLabelText('Timeline view'));
    expect(localStorage.getItem('view-pref-secretary-tasks')).toBe('timeline');
  });

  it('restores view preference from localStorage', () => {
    localStorage.setItem('view-pref-secretary-tasks', 'timeline');

    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });
    expect(screen.getByLabelText('Timeline view')).toHaveClass('bg-primary');
  });
});

describe('TasksTab — Timeline view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('view-pref-secretary-tasks', 'timeline');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders dated tasks in the timeline', () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [makeTask({ id: 'task-dated', title: 'Dated task', dueDate: today })],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} clubId="club-1" />, {
      wrapper,
    });

    expect(screen.getByText('Dated task')).toBeInTheDocument();
  });

  it('renders "No due date" section for undated tasks', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [makeTask({ id: 'task-undated', title: 'Undated task', dueDate: undefined })],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });

    expect(screen.getByText('No due date')).toBeInTheDocument();
    expect(screen.getByText('Undated task')).toBeInTheDocument();
  });

  it('mark done calls updateTask mutation', () => {
    const mutateFn = vi.fn();
    vi.mocked(useUpdateTask).mockReturnValue({
      mutate: mutateFn,
      isPending: false,
    } as ReturnType<typeof useUpdateTask>);

    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [makeTask({ id: 'task-tl', title: 'TL task', dueDate: today, status: 'todo' })],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} clubId="club-1" />, {
      wrapper,
    });

    const checkbox = screen.getByLabelText('Mark "TL task" as done');
    fireEvent.click(checkbox);

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-tl',
        update: { status: 'done' },
      })
    );
  });

  it('edit controls update a dated timeline task', () => {
    const mutateFn = vi.fn();
    vi.mocked(useUpdateTask).mockReturnValue({
      mutate: mutateFn,
      isPending: false,
    } as ReturnType<typeof useUpdateTask>);

    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [
        makeTask({
          id: 'task-edit',
          title: 'Old timeline title',
          dueDate: '2026-05-12',
          showId: 'show-1',
        }),
      ],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(
      <TasksTab
        shows={[
          { id: 'show-1', name: 'Spring Trial' },
          { id: 'show-2', name: 'Summer Trial' },
        ]}
        clubId="club-1"
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByLabelText('Edit "Old timeline title"'));
    fireEvent.change(screen.getByDisplayValue('Old timeline title'), {
      target: { value: 'Updated timeline title' },
    });
    fireEvent.change(screen.getByDisplayValue('2026-05-12'), {
      target: { value: '2026-05-20' },
    });
    fireEvent.change(screen.getByDisplayValue('Spring Trial'), {
      target: { value: 'show-2' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-edit',
        update: {
          title: 'Updated timeline title',
          dueDate: '2026-05-20',
          showId: 'show-2',
        },
      }),
      expect.any(Object)
    );
  });

  it('delete controls delete a dated timeline task', () => {
    const mutateFn = vi.fn();
    vi.mocked(useDeleteTask).mockReturnValue({
      mutate: mutateFn,
      isPending: false,
    } as ReturnType<typeof useDeleteTask>);

    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [makeTask({ id: 'task-delete', title: 'Delete timeline task', dueDate: today })],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} clubId="club-1" />, {
      wrapper,
    });

    fireEvent.click(screen.getByLabelText('Delete "Delete timeline task"'));

    expect(mutateFn).toHaveBeenCalledWith('task-delete', expect.any(Object));
  });

  it('undated timeline tasks expose edit and delete controls', () => {
    const updateMutate = vi.fn();
    const deleteMutate = vi.fn();
    vi.mocked(useUpdateTask).mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    } as ReturnType<typeof useUpdateTask>);
    vi.mocked(useDeleteTask).mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as ReturnType<typeof useDeleteTask>);

    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [
        makeTask({
          id: 'task-undated-actions',
          title: 'Undated timeline task',
          dueDate: undefined,
          showId: null,
        }),
      ],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} clubId="club-1" />, {
      wrapper,
    });

    fireEvent.click(screen.getByLabelText('Edit "Undated timeline task"'));
    fireEvent.change(screen.getByDisplayValue('Undated timeline task'), {
      target: { value: 'Scheduled timeline task' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-undated-actions',
        update: {
          title: 'Scheduled timeline task',
          dueDate: null,
          showId: null,
        },
      }),
      expect.any(Object)
    );

    fireEvent.click(screen.getByLabelText('Delete "Undated timeline task"'));
    expect(deleteMutate).toHaveBeenCalledWith('task-undated-actions', expect.any(Object));
  });

  it('hides completed tasks until "Show completed" is toggled', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [
        makeTask({ id: 'open-1', title: 'Open TL task', status: 'todo', dueDate: undefined }),
        makeTask({ id: 'done-1', title: 'Done TL task', status: 'done', dueDate: undefined }),
      ],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });

    expect(screen.getByText('Open TL task')).toBeInTheDocument();
    expect(screen.queryByText('Done TL task')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Show completed'));
    expect(screen.getByText('Done TL task')).toBeInTheDocument();
  });

  it('filter chips affect the timeline — switching to a show filter passes it through', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} clubId="club-1" />, {
      wrapper,
    });

    fireEvent.click(screen.getByText('Spring Trial'));
    // useSecretaryTasks should be called with show-1
    expect(vi.mocked(useSecretaryTasks)).toHaveBeenCalledWith('show-1');
  });

  it('shows empty state when no tasks in timeline', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab shows={[]} clubId="club-1" />, { wrapper });
    expect(screen.getByText('No open tasks.')).toBeInTheDocument();
  });
});
