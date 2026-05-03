import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { TaskRow } from '../TaskRow';
import { TasksTab } from '../TasksTab';
import type { SecretaryTask } from '../types';

vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateTask: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateTask: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteTask: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { useSecretaryTasks, useUpdateTask } from '@/hooks/queries/useSecretaryTasks';

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
