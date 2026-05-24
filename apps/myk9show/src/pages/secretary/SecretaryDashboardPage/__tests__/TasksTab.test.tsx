import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { TaskRow } from '../TaskRow';
import { TaskAddForm } from '../TaskAddForm';
import { TasksTab, TASKS_TAB_RESERVED_MIN_HEIGHT_PX } from '../TasksTab';
import type { SecretaryTask } from '../types';

vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: vi.fn(() => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() })),
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
  showId: null,
  title: 'Call vet about Wednesday',
  status: 'todo',
  priority: 'high',
  dueDate: new Date().toISOString().slice(0, 10),
  createdBy: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('TaskRow', () => {
  it('renders task title and show chip when shown', () => {
    render(
      <TaskRow
        task={makeTask({ showId: 'show-1' })}
        showName="Spring Trial"
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Call vet about Wednesday')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
  });

  it('hides the show chip when hideShowChip is true', () => {
    render(
      <TaskRow
        task={makeTask({ showId: 'show-1' })}
        showName="Spring Trial"
        hideShowChip
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByText('Spring Trial')).not.toBeInTheDocument();
  });

  it('calls onToggleDone when checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(
      <TaskRow
        task={makeTask()}
        showName=""
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
        showName=""
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(container.querySelector('.line-through')).toBeInTheDocument();
  });

  it('hides the show selector in edit mode when lockShowEdit is true', () => {
    const onUpdate = vi.fn();
    render(
      <TaskRow
        task={makeTask({ showId: 'show-1' })}
        showName=""
        shows={[{ id: 'show-1', name: 'Spring Trial' }]}
        lockShowEdit
        onToggleDone={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(/Edit "Call vet/i));
    // No select element should be present in edit mode
    expect(screen.queryByDisplayValue('Spring Trial')).not.toBeInTheDocument();
  });

  it('omits showId from the update payload when lockShowEdit is true', () => {
    const onUpdate = vi.fn();
    render(
      <TaskRow
        task={makeTask({ showId: 'show-1' })}
        showName=""
        shows={[{ id: 'show-1', name: 'Spring Trial' }]}
        lockShowEdit
        onToggleDone={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(/Edit "Call vet/i));
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdate).toHaveBeenCalledWith(
      'task-1',
      expect.not.objectContaining({ showId: expect.anything() })
    );
  });
});

describe('TaskAddForm', () => {
  it('hides the show selector and forces lockedShowId=null on submit', () => {
    const onAdd = vi.fn();
    render(
      <TaskAddForm
        clubId="club-1"
        lockedShowId={null}
        onAdd={onAdd}
        onCancel={vi.fn()}
      />
    );
    // No select element
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Task title…'), {
      target: { value: 'New personal task' },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New personal task', showId: null, clubId: 'club-1' })
    );
  });

  it('hides the show selector and forces lockedShowId=<showId> on submit', () => {
    const onAdd = vi.fn();
    render(
      <TaskAddForm
        clubId="club-1"
        lockedShowId="show-42"
        onAdd={onAdd}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Task title…'), {
      target: { value: 'Per-show task' },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Per-show task', showId: 'show-42', clubId: 'club-1' })
    );
  });

  it('renders the show selector when lockedShowId is undefined (legacy mode)', () => {
    render(
      <TaskAddForm
        clubId="club-1"
        shows={[{ id: 'show-1', name: 'Spring Trial' }]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});

describe('TasksTab — personal-only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('queries useSecretaryTasks with the "general" filter (personal only)', () => {
    render(<TasksTab clubId="club-1" />, { wrapper });
    expect(vi.mocked(useSecretaryTasks)).toHaveBeenCalledWith('general');
  });

  it('renders no show-filter chips', () => {
    render(<TasksTab clubId="club-1" />, { wrapper });
    expect(screen.queryByText('All Shows')).not.toBeInTheDocument();
    expect(screen.queryByText('General')).not.toBeInTheDocument();
  });

  it('shows the personal-only empty state when no tasks', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab clubId="club-1" />, { wrapper });
    expect(
      screen.getByText(/No personal tasks\. Per-show tasks live in each show's Tools sheet\./i)
    ).toBeInTheDocument();
  });

  it('shows an inline error state with retry when the query errors', () => {
    const refetch = vi.fn();
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab clubId="club-1" />, { wrapper });
    expect(screen.getByText(/Couldn't load your tasks/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
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
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab clubId="club-1" />, { wrapper });

    expect(screen.queryByText('Old task')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show completed'));
    expect(screen.getByText('Old task')).toBeInTheDocument();
  });

  it('reserves min-height in the loading skeleton to prevent CLS', () => {
    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab clubId="club-1" />, { wrapper });
    const skeleton = screen.getByTestId('tasks-tab-skeleton');
    expect(skeleton.style.minHeight).toBe(`${TASKS_TAB_RESERVED_MIN_HEIGHT_PX}px`);
  });

  it('renders the List/Timeline view toggle', () => {
    render(<TasksTab clubId="club-1" />, { wrapper });
    expect(screen.getByLabelText('List view')).toBeInTheDocument();
    expect(screen.getByLabelText('Timeline view')).toBeInTheDocument();
  });

  it('Add Task opens TaskAddForm in locked-personal mode (no show selector visible)', () => {
    render(<TasksTab clubId="club-1" />, { wrapper });
    fireEvent.click(screen.getByText('+ Add Task'));
    // TaskAddForm is rendered; lockedShowId={null} means no combobox
    expect(screen.getByPlaceholderText('Task title…')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('passes lockShowEdit + hideShowChip to TaskRows so edits cannot move tasks across scopes', () => {
    const updateMutate = vi.fn();
    vi.mocked(useUpdateTask).mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    } as ReturnType<typeof useUpdateTask>);

    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [makeTask({ id: 'task-personal', title: 'Personal task', showId: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab clubId="club-1" />, { wrapper });

    // Show chip should not appear
    expect(screen.queryByText('Spring Trial')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Edit "Personal task"/i));
    fireEvent.click(screen.getByText('Save'));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-personal',
        update: expect.not.objectContaining({ showId: expect.anything() }),
      }),
      expect.any(Object)
    );
  });

  it('delete still works on personal task rows', () => {
    const deleteMutate = vi.fn();
    vi.mocked(useDeleteTask).mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as ReturnType<typeof useDeleteTask>);

    vi.mocked(useSecretaryTasks).mockReturnValue({
      data: [makeTask({ id: 'task-x', title: 'Trash me' })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSecretaryTasks>);

    render(<TasksTab clubId="club-1" />, { wrapper });
    fireEvent.click(screen.getByLabelText(/Delete "Trash me"/i));
    expect(deleteMutate).toHaveBeenCalledWith('task-x', expect.any(Object));
  });
});
