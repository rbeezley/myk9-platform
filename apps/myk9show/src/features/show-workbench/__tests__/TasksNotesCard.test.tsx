import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { TasksNotesCard } from '../TasksNotesCard';

const mockUseSecretaryTasks = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: (...args: unknown[]) => mockUseSecretaryTasks(...args),
}));

describe('TasksNotesCard', () => {
  it('renders heading + dashboard link', () => {
    mockUseSecretaryTasks.mockReturnValue({ data: [] });
    render(<TasksNotesCard showId="show-1" />);

    expect(screen.getByRole('heading', { name: /tasks & notes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open tasks/i })).toHaveAttribute(
      'href',
      '/secretary/dashboard?showId=show-1'
    );
  });

  it('shows the open-task count when there are todos', () => {
    mockUseSecretaryTasks.mockReturnValue({
      data: [
        { id: 't1', status: 'todo' },
        { id: 't2', status: 'todo' },
        { id: 't3', status: 'done' },
      ],
    });
    render(<TasksNotesCard showId="show-1" />);

    expect(screen.getByTestId('tasks-notes-open-count')).toHaveTextContent('2 open');
  });

  it('shows "None open" when no todos exist', () => {
    mockUseSecretaryTasks.mockReturnValue({ data: [{ id: 't1', status: 'done' }] });
    render(<TasksNotesCard showId="show-1" />);

    expect(screen.getByTestId('tasks-notes-open-count')).toHaveTextContent('None open');
  });

  it('passes the showId to useSecretaryTasks so the count is scoped to this show', () => {
    mockUseSecretaryTasks.mockReturnValue({ data: [] });
    render(<TasksNotesCard showId="show-42" />);

    expect(mockUseSecretaryTasks).toHaveBeenCalledWith('show-42');
  });
});
