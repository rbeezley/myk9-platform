/**
 * MYK9-1086: the ringside "Set Max Time" dialog saves the class's max time.
 *
 * Value-sensitive: the time must reach replicatedClassesTable.updateClass as seconds
 * (so the offline queue routes it through ringside_update_class), for both classes
 * of a combined A/B pair.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';

const { updateClass, getClass, resolveRules } = vi.hoisted(() => ({
  updateClass: vi.fn(),
  getClass: vi.fn(),
  resolveRules: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass, get: getClass },
}));
vi.mock('@/services/replication/resolveClassTimeLimitRules', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/resolveClassTimeLimitRules')>()),
  resolveTimeLimitRulesForClassRows: resolveRules,
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
    // Interior Novice: judge-set 1:00..3:00, synced onto the class.
    getClass.mockReset().mockResolvedValue({
      id: 'class-a',
      trialId: 't1',
      element: 'Interior',
      level: 'Novice',
      timeLimitRule: { min: 60, max: 180 },
    });
    resolveRules.mockReset().mockResolvedValue(new Map());
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
    getClass.mockResolvedValue({ id: 'class-a', timeLimitRule: { min: 60, max: 900 } });
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

  it('refuses a time outside the class rule before applying it (server would reject it)', async () => {
    render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
      target: { value: '4:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/1:00 and 3:00/);
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('looks the rule up online when the class has none cached', async () => {
    getClass.mockResolvedValue({
      id: 'class-a',
      trialId: 't1',
      element: 'Container',
      level: 'Novice',
    });
    resolveRules.mockResolvedValue(new Map([['class-a', { fixed: 120 }]]));
    render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
      target: { value: '2:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/0:01 and 2:00/);
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('will not guess offline when the rule is unknown', async () => {
    getClass.mockResolvedValue({
      id: 'class-a',
      trialId: 't1',
      element: 'Interior',
      level: 'Novice',
    });
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
      fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
        target: { value: '2:00' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i);
      expect(updateClass).not.toHaveBeenCalled();
      expect(resolveRules).not.toHaveBeenCalled();
    } finally {
      online.mockRestore();
    }
  });
});
