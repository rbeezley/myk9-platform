/**
 * MYK9-1086: the ringside "Set Max Time" dialog saves the class's max time.
 *
 * Value-sensitive: the time must reach replicatedClassesTable.updateClass as seconds
 * (so the offline queue routes it through ringside_update_class), for both classes
 * of a combined A/B pair.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';

const { updateClass } = vi.hoisted(() => ({ updateClass: vi.fn() }));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass },
}));

import { MaxTimeDialog } from './MaxTimeDialog';

const classData = {
  id: 'class-a',
  element: 'Interior',
  level: 'Novice',
  class_name: 'Interior Novice A',
};

describe('MaxTimeDialog (MYK9-1086)', () => {
  beforeEach(() => {
    updateClass.mockReset().mockResolvedValue('mutation-1');
  });

  it('saves the entered time as seconds and reports the update', async () => {
    const onTimeUpdate = vi.fn();
    const onClose = vi.fn();
    render(
      <MaxTimeDialog isOpen classData={classData} onClose={onClose} onTimeUpdate={onTimeUpdate} />
    );

    fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
      target: { value: '2:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(updateClass).toHaveBeenCalledWith('class-a', { timeLimitSeconds: 150 })
    );
    expect(onTimeUpdate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sets both classes of a combined A/B pair', async () => {
    render(
      <MaxTimeDialog
        isOpen
        classData={{ ...classData, pairedClassId: 'class-b' }}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
      target: { value: '3:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(updateClass).toHaveBeenCalledTimes(2));
    expect(updateClass).toHaveBeenCalledWith('class-a', { timeLimitSeconds: 180 });
    expect(updateClass).toHaveBeenCalledWith('class-b', { timeLimitSeconds: 180 });
  });

  it('shows the current time and refuses an unreadable entry', () => {
    render(
      <MaxTimeDialog
        isOpen
        classData={{ ...classData, time_limit_seconds: 120 }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('textbox', { name: /max time/i })).toHaveValue('2:00');

    fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
      target: { value: 'soon' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/like 4:00/i);
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('reads keyboard-friendly entries: 4.30, 430 and a bare 4 (iPhone numeric pad has no colon)', async () => {
    for (const [typed, seconds] of [
      ['4.30', 270],
      ['430', 270],
      ['4', 240],
      ['1200', 720],
    ] as const) {
      updateClass.mockClear();
      const { unmount } = render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
      fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
        target: { value: typed },
      });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() =>
        expect(updateClass).toHaveBeenCalledWith('class-a', { timeLimitSeconds: seconds })
      );
      unmount();
    }
  });

  it('opens fresh: shows the current time and drops an abandoned edit', () => {
    const props = { classData: { ...classData, time_limit_seconds: 120 }, onClose: vi.fn() };
    const { rerender } = render(<MaxTimeDialog isOpen {...props} />);
    fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
      target: { value: '9:99' },
    });

    // Cancelled, then the class's time changed in the background, then reopened.
    rerender(<MaxTimeDialog isOpen={false} {...props} />);
    rerender(
      <MaxTimeDialog isOpen {...props} classData={{ ...classData, time_limit_seconds: 150 }} />
    );

    expect(screen.getByRole('textbox', { name: /max time/i })).toHaveValue('2:30');
  });
});
