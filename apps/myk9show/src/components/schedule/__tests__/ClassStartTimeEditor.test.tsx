import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { createTestQueryClient, render, screen } from '@/test/utils/testUtils';
import { ClassStartTimeEditor } from '../ClassStartTimeEditor';

const updateClassMock = vi.fn().mockResolvedValue('mutation-1');

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: (...args: unknown[]) => updateClassMock(...args),
  },
}));

const successMock = vi.fn();
vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: (...args: unknown[]) => successMock(...args),
    error: vi.fn(),
  },
}));

describe('ClassStartTimeEditor', () => {
  beforeEach(() => {
    updateClassMock.mockClear();
    successMock.mockClear();
  });

  const baseProps = {
    classId: 'class-1',
    showId: 'show-1',
    trialId: 'trial-1',
    judgeId: 'judge-1',
    judgeName: 'Jane Doe',
    trialLevels: [
      {
        classId: 'class-1',
        className: 'Container Novice',
        judgeId: 'judge-1',
        judgeName: 'Jane Doe',
        startTime: null,
      },
    ],
  };

  it('renders the current start time with an edit affordance', () => {
    render(<ClassStartTimeEditor {...baseProps} startTime="09:00:00" />);
    expect(screen.getByRole('button', { name: /edit start time/i })).toHaveTextContent('9:00 AM');
  });

  it('formats a time without time zone as the same local input time', async () => {
    const { user } = render(<ClassStartTimeEditor {...baseProps} startTime="09:00:00" />);

    await user.click(screen.getByRole('button', { name: /edit start time/i }));

    expect(screen.getByLabelText('Start time')).toHaveValue('09:00');
  });

  it('shows TBD when there is no start time yet', () => {
    render(<ClassStartTimeEditor {...baseProps} startTime={null} />);
    expect(screen.getByRole('button', { name: /edit start time/i })).toHaveTextContent('TBD');
  });

  it('saves a valid time through replicatedClassesTable.updateClass and shows the new value', async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { user } = render(<ClassStartTimeEditor {...baseProps} startTime={null} />, {
      queryClient,
    });

    await user.click(screen.getByRole('button', { name: /edit start time/i }));

    const input = screen.getByLabelText('Start time') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '09:30' } });

    await user.click(screen.getByRole('button', { name: /save start time/i }));

    expect(updateClassMock).toHaveBeenCalledWith('class-1', { startTime: '09:30:00' });
    expect(successMock).toHaveBeenCalledWith(expect.stringContaining('9:30 AM'));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['shows', 'show-1', 'schedule-timeline'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['classes', 'detail', 'class-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['classes', 'trial', 'trial-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['classes', 'list'] });
    expect(screen.getByRole('button', { name: /edit start time/i })).toHaveTextContent('9:30 AM');
  });

  it('rejects invalid input with a plain-language message and does not save', async () => {
    const { user } = render(<ClassStartTimeEditor {...baseProps} startTime={null} />);

    await user.click(screen.getByRole('button', { name: /edit start time/i }));
    const input = screen.getByLabelText('Start time') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });

    await user.click(screen.getByRole('button', { name: /save start time/i }));

    expect(updateClassMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid time');
  });

  it('prevents assigning one judge to two classes at the same time', async () => {
    const { user } = render(
      <ClassStartTimeEditor
        {...baseProps}
        startTime={null}
        trialLevels={[
          ...baseProps.trialLevels,
          {
            classId: 'class-2',
            className: 'Container Advanced',
            judgeId: 'judge-1',
            judgeName: 'Jane Doe',
            startTime: '09:30:00',
          },
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: /edit start time/i }));
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:30' } });
    await user.click(screen.getByRole('button', { name: /save start time/i }));

    expect(updateClassMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Jane Doe is already assigned to Container Advanced at 9:30 AM'
    );
  });

  it('updates the displayed value when replicated data changes', () => {
    const { rerender } = render(<ClassStartTimeEditor {...baseProps} startTime="09:00:00" />);

    rerender(<ClassStartTimeEditor {...baseProps} startTime="10:15:00" />);

    expect(screen.getByRole('button', { name: /edit start time/i })).toHaveTextContent('10:15 AM');
  });

  it('cancels editing on Escape without saving', async () => {
    const { user } = render(<ClassStartTimeEditor {...baseProps} startTime="09:00:00" />);

    await user.click(screen.getByRole('button', { name: /edit start time/i }));
    const input = screen.getByLabelText('Start time');
    await user.type(input, '{Escape}');

    expect(updateClassMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /edit start time/i })).toHaveTextContent('9:00 AM');
  });
});
