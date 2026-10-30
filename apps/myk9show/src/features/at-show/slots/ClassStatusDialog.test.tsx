/**
 * MYK9-1513: the ringside class-status dialog offers v3's eight statuses with
 * their descriptions, marks the current one, and asks for a time where v3 does.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@/test/utils/testUtils';
import { ClassStatusDialog } from './ClassStatusDialog';

const classData = {
  id: 'class-1',
  element: 'Interior',
  level: 'Novice',
  class_name: 'Interior Novice',
  class_status: 'no-status',
  entry_count: 12,
};

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ClassStatusDialog>> = {},
  data: Partial<typeof classData & { briefing_time: string }> = {}
) {
  const onStatusChange = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  render(
    <ClassStatusDialog
      isOpen
      onClose={onClose}
      onStatusChange={onStatusChange}
      classData={{ ...classData, ...data }}
      currentStatus="no-status"
      {...overrides}
    />
  );
  return { onStatusChange, onClose };
}

describe('ClassStatusDialog (MYK9-1513)', () => {
  it('lists all eight statuses with readable labels and descriptions, no raw ids', () => {
    renderDialog();
    const group = screen.getByRole('group', { name: 'Class status' });
    const labels = within(group)
      .getAllByRole('button')
      .map(button => button.querySelector('span > span')?.textContent);
    expect(labels).toEqual([
      'No Status',
      'Setup',
      'Briefing',
      'Break',
      'Start Time',
      'In Progress',
      'Offline Scoring',
      'Completed',
    ]);
    expect(screen.getByText('Judging offline - run order delayed')).toBeInTheDocument();
    expect(screen.getByText('Class has finished')).toBeInTheDocument();
    expect(screen.queryByText('offline-scoring')).not.toBeInTheDocument();
    expect(screen.queryByText(/Current:/)).not.toBeInTheDocument();
  });

  it('marks the current status', () => {
    renderDialog({ currentStatus: 'break' });
    const breakButton = screen.getByRole('button', { name: /^Break/ });
    expect(within(breakButton).getByText('Current')).toBeInTheDocument();
    expect(screen.getAllByText('Current')).toHaveLength(1);
  });

  it('sends a status that takes no time straight away and closes', async () => {
    const { onStatusChange, onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /^Offline Scoring/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onStatusChange).toHaveBeenCalledWith('offline-scoring', undefined);
  });

  it.each([
    ['Briefing', 'briefing', 'Briefing time', '10:00'],
    ['Break', 'break', 'Break until', '10:30'],
    ['Start Time', 'start_time', 'Start time', '11:15'],
  ])('%s asks for a time and sends it with the status', async (name, status, label, time) => {
    const { onStatusChange, onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
    expect(onStatusChange).not.toHaveBeenCalled();
    const input = screen.getByLabelText(label);
    expect(screen.getByRole('button', { name: `Set ${name}` })).toBeDisabled();
    fireEvent.change(input, { target: { value: time } });
    fireEvent.click(screen.getByRole('button', { name: `Set ${name}` }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onStatusChange).toHaveBeenCalledWith(status, time);
  });

  it("prefills the class's saved briefing time", () => {
    renderDialog({}, { briefing_time: '09:45' });
    fireEvent.click(screen.getByRole('button', { name: /^Briefing/ }));
    expect(screen.getByLabelText('Briefing time')).toHaveValue('09:45');
  });

  it('stays open and says so when the change fails', async () => {
    const onStatusChange = vi.fn(() => Promise.reject(new Error('nope')));
    const { onClose } = renderDialog({ onStatusChange });
    fireEvent.click(screen.getByRole('button', { name: /^Completed/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change the status');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps Mark Unscored Absent', () => {
    const onMarkAbsent = vi.fn(() => Promise.resolve());
    renderDialog({ onMarkAbsent });
    fireEvent.click(screen.getByRole('button', { name: 'Mark Unscored Absent' }));
    expect(onMarkAbsent).toHaveBeenCalled();
  });
});
