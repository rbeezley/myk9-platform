import { screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { TasksNotesCard } from '../TasksNotesCard';
import type { SecretaryTask } from '@/pages/secretary/SecretaryDashboardPage/types';

const mockUseSecretaryTasks = vi.hoisted(() => vi.fn());
const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockDeleteMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: (...args: unknown[]) => mockUseSecretaryTasks(...args),
  useCreateTask: () => ({ mutate: mockCreateMutate, isPending: false }),
  useUpdateTask: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteTask: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

const makeTask = (overrides: Partial<SecretaryTask> = {}): SecretaryTask => ({
  id: 'task-1',
  clubId: 'club-1',
  showId: 'show-1',
  title: 'Order ribbons',
  status: 'todo',
  createdBy: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('TasksNotesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSecretaryTasks.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('renders heading and scoped open-count badge', () => {
    mockUseSecretaryTasks.mockReturnValue({
      data: [makeTask({ id: 't1' }), makeTask({ id: 't2' }), makeTask({ id: 't3', status: 'done' })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<TasksNotesCard showId="show-1" clubId="club-1" />);

    expect(screen.getByRole('heading', { name: /tasks & notes/i })).toBeInTheDocument();
    expect(screen.getByTestId('tasks-notes-open-count')).toHaveTextContent('2 open');
  });

  it('shows "None open" when no todos exist', () => {
    mockUseSecretaryTasks.mockReturnValue({
      data: [makeTask({ id: 't1', status: 'done' })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<TasksNotesCard showId="show-1" clubId="club-1" />);
    expect(screen.getByTestId('tasks-notes-open-count')).toHaveTextContent('None open');
  });

  it('passes the showId to useSecretaryTasks so data is scoped', () => {
    render(<TasksNotesCard showId="show-42" clubId="club-1" />);
    expect(mockUseSecretaryTasks).toHaveBeenCalledWith('show-42');
  });

  it('does NOT render a link back to the dashboard (no more two-homes round trip)', () => {
    render(<TasksNotesCard showId="show-1" clubId="club-1" />);
    expect(screen.queryByRole('link', { name: /open tasks/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('Add task button opens the inline form in locked-show mode (no selector visible)', () => {
    render(<TasksNotesCard showId="show-1" clubId="club-1" />);
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    expect(screen.getByPlaceholderText('Task title…')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('creating a task locks the showId to this card\'s show', () => {
    render(<TasksNotesCard showId="show-42" clubId="club-1" />);
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    fireEvent.change(screen.getByPlaceholderText('Task title…'), {
      target: { value: 'Sweep the ring' },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sweep the ring',
        showId: 'show-42',
        clubId: 'club-1',
      }),
      expect.any(Object)
    );
  });

  it('renders task rows with hideShowChip + lockShowEdit (no show chip; edits omit showId)', () => {
    mockUseSecretaryTasks.mockReturnValue({
      data: [makeTask({ id: 'task-x', title: 'Set up rings', showId: 'show-1' })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<TasksNotesCard showId="show-1" clubId="club-1" />);

    // No show chip rendered
    expect(screen.queryByText('show-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Edit "Set up rings"/i));
    fireEvent.click(screen.getByText('Save'));
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-x',
        update: expect.not.objectContaining({ showId: expect.anything() }),
      }),
      expect.any(Object)
    );
  });

  it('shows an error state with retry when the tasks query errors', () => {
    const refetch = vi.fn();
    mockUseSecretaryTasks.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<TasksNotesCard showId="show-1" clubId="club-1" />);
    expect(screen.getByText(/Couldn't load tasks for this show/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the empty-state copy when no tasks exist for this show', () => {
    render(<TasksNotesCard showId="show-1" clubId="club-1" />);
    expect(screen.getByText(/No tasks for this show yet\./i)).toBeInTheDocument();
  });
});
