/**
 * MYK9-1086: the ringside "Set Max Time" dialog saves the class's max time.
 *
 * Value-sensitive: the time must reach replicatedClassesTable.updateClass as seconds
 * (so the offline queue routes it through ringside_update_class), for both classes
 * of a combined A/B pair.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';

const { updateClass, getClass, resolveRules, listeners } = vi.hoisted(() => ({
  updateClass: vi.fn(),
  getClass: vi.fn(),
  resolveRules: vi.fn(),
  listeners: new Set<() => void>(),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass,
    get: getClass,
    getClassById: getClass,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  },
}));
vi.mock('@/services/replication/resolveClassTimeLimitRules', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/resolveClassTimeLimitRules')>()),
  resolveTimeLimitRulesForClassRows: resolveRules,
}));

import { MaxTimeDialog } from './MaxTimeDialog';

/** Save waits for the class's rule to load (a rulebook time must not be typed over). */
async function clickSave() {
  const save = screen.getByRole('button', { name: /save/i });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
}

const classData = {
  id: 'class-a',
  element: 'Interior',
  level: 'Novice',
  class_name: 'Interior Novice A',
};

describe('MaxTimeDialog (MYK9-1086)', () => {
  beforeEach(() => {
    listeners.clear();
    updateClass.mockReset().mockResolvedValue('mutation-1');
    // Interior Novice: judge-set 1:00..3:00, synced onto the class.
    getClass.mockReset().mockResolvedValue({
      id: 'class-a',
      trialId: 't1',
      element: 'Interior',
      level: 'Novice',
      timeLimitRule: { min: 60, max: 180, forElement: 'Interior', forLevel: 'Novice' },
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
    await clickSave();

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
    await clickSave();

    await waitFor(() => expect(updateClass).toHaveBeenCalledTimes(2));
    expect(updateClass).toHaveBeenCalledWith('class-a', { timeLimitSeconds: 180 });
    expect(updateClass).toHaveBeenCalledWith('class-b', { timeLimitSeconds: 180 });
  });

  it('shows the current time and refuses an unreadable entry', async () => {
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
    await clickSave();

    expect(await screen.findByText(/like 4:00/i)).toHaveAttribute('role', 'alert');
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('reads keyboard-friendly entries: 4.30, 430 and a bare 4 (iPhone numeric pad has no colon)', async () => {
    getClass.mockResolvedValue({
      id: 'class-a',
      element: 'Interior',
      level: 'Novice',
      timeLimitRule: { min: 60, max: 900, forElement: 'Interior', forLevel: 'Novice' },
    });
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
      await clickSave();
      await waitFor(() =>
        expect(updateClass).toHaveBeenCalledWith('class-a', { timeLimitSeconds: seconds })
      );
      unmount();
    }
  });

  it('opens fresh: shows the current time and drops an abandoned edit', async () => {
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
    await clickSave();

    expect(await screen.findByText(/class must be between 1:00 and 3:00/i)).toHaveAttribute(
      'role',
      'alert'
    );
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('looks the rule up online when none is cached, and shows a rulebook time read-only', async () => {
    getClass.mockResolvedValue({
      id: 'class-a',
      trialId: 't1',
      element: 'Container',
      level: 'Novice',
    });
    resolveRules.mockResolvedValue(
      new Map([['class-a', { fixed: 120, forElement: 'Container', forLevel: 'Novice' }]])
    );
    render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);

    expect(await screen.findByText('2:00')).toBeInTheDocument();
    expect(screen.getByText(/set by the rulebook/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await clickSave();
    await waitFor(() =>
      expect(updateClass).toHaveBeenCalledWith('class-a', { timeLimitSeconds: 120 })
    );
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
      await clickSave();

      expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i);
      expect(updateClass).not.toHaveBeenCalled();
      expect(resolveRules).not.toHaveBeenCalled();
    } finally {
      online.mockRestore();
    }
  });

  it("ignores a cached rule from before the class's element changed", async () => {
    getClass.mockResolvedValue({
      id: 'class-a',
      trialId: 't1',
      element: 'Exterior',
      level: 'Novice',
      timeLimitRule: { min: 60, max: 180, forElement: 'Interior', forLevel: 'Novice' },
    });
    resolveRules.mockResolvedValue(
      new Map([['class-a', { min: 120, max: 240, forElement: 'Exterior', forLevel: 'Novice' }]])
    );
    render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
      target: { value: '1:30' },
    });
    await clickSave();

    expect(await screen.findByRole('alert')).toHaveTextContent(/2:00 and 4:00/);
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('refuses rather than guesses when the online rule lookup fails', async () => {
    getClass.mockResolvedValue({
      id: 'class-a',
      trialId: 't1',
      element: 'Interior',
      level: 'Novice',
    });
    resolveRules.mockResolvedValue(null);
    render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: /max time/i }), {
      target: { value: '9:00' },
    });
    await clickSave();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t check/i);
    expect(updateClass).not.toHaveBeenCalled();
  });

  describe('multi-area class (MYK9-1098)', () => {
    const twoAreas = {
      ...classData,
      level: 'Excellent',
      class_name: 'Interior Excellent A',
      area_count: 2,
      per_area_times: true,
      time_limit_seconds: 90,
    };
    const areaInput = (n: number) =>
      screen.getByRole('textbox', { name: new RegExp(`area ${n} max time`, 'i') });

    it('shows one input per area and saves each area time, for both classes of a pair', async () => {
      render(
        <MaxTimeDialog
          isOpen
          classData={{ ...twoAreas, pairedClassId: 'class-b' }}
          onClose={vi.fn()}
        />
      );
      expect(areaInput(1)).toHaveValue('1:30');
      // An area with no time of its own starts at area 1's (the time it runs on).
      expect(areaInput(2)).toHaveValue('1:30');

      fireEvent.change(areaInput(2), { target: { value: '2:30' } });
      await clickSave();

      const expected = { timeLimitSeconds: 90, timeLimitArea2Seconds: 150 };
      await waitFor(() => expect(updateClass).toHaveBeenCalledTimes(2));
      expect(updateClass).toHaveBeenCalledWith('class-a', expected);
      expect(updateClass).toHaveBeenCalledWith('class-b', expected);
    });

    it('needs every area before saving', async () => {
      render(<MaxTimeDialog isOpen classData={twoAreas} onClose={vi.fn()} />);
      fireEvent.change(areaInput(2), { target: { value: '' } });
      await clickSave();

      expect(await screen.findByText(/enter the area 2 max time/i)).toHaveAttribute(
        'role',
        'alert'
      );
      expect(updateClass).not.toHaveBeenCalled();
    });

    it('range-checks every area, not just area 1', async () => {
      render(<MaxTimeDialog isOpen classData={twoAreas} onClose={vi.fn()} />);
      fireEvent.change(areaInput(2), { target: { value: '5:00' } });
      await clickSave();

      expect(await screen.findByText(/class must be between 1:00 and 3:00/i)).toHaveAttribute(
        'role',
        'alert'
      );
      expect(updateClass).not.toHaveBeenCalled();
    });

    it('asks for one time when the scoresheet does not time areas separately (ASCA, Nationals)', async () => {
      render(
        <MaxTimeDialog
          isOpen
          classData={{ ...twoAreas, per_area_times: false }}
          onClose={vi.fn()}
        />
      );
      expect(screen.getAllByRole('textbox')).toHaveLength(1);
    });
  });

  describe('before the judge types (MYK9-1101)', () => {
    it('shows the allowed range with 30-second quick picks that fill the time', async () => {
      render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);

      expect(await screen.findByText(/allowed: 1:00 to 3:00/i)).toBeInTheDocument();
      const picks = screen.getByRole('group', { name: /quick max times/i });
      expect(
        Array.from(picks.querySelectorAll('button')).map(button => button.textContent)
      ).toEqual(['1:00', '1:30', '2:00', '2:30', '3:00']);

      fireEvent.click(screen.getByRole('button', { name: '2:30' }));
      expect(screen.getByRole('textbox', { name: /max time/i })).toHaveValue('2:30');
      await clickSave();
      await waitFor(() =>
        expect(updateClass).toHaveBeenCalledWith('class-a', { timeLimitSeconds: 150 })
      );
    });

    it('previews what the digits mean and range-checks inline before Save (MYK9-1503)', async () => {
      render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
      await screen.findByText(/allowed: 1:00 to 3:00/i);
      const input = screen.getByRole('textbox', { name: /max time/i });

      fireEvent.change(input, { target: { value: '230' } });
      expect(screen.getByTestId('duration-preview')).toHaveTextContent('= 2:30');
      expect(input).toHaveAttribute('inputmode', 'numeric');

      fireEvent.change(input, { target: { value: '9' } });
      expect(screen.getByTestId('duration-error')).toHaveTextContent(
        'Must be between 1:00 and 3:00.'
      );

      fireEvent.change(input, { target: { value: '299' } });
      expect(screen.getByTestId('duration-error')).toHaveTextContent('99 seconds is 3:39');
      expect(updateClass).not.toHaveBeenCalled();
    });

    it('fills the area the judge last tapped', async () => {
      render(
        <MaxTimeDialog
          isOpen
          classData={{ ...classData, area_count: 2, per_area_times: true }}
          onClose={vi.fn()}
        />
      );
      await screen.findByText(/allowed: 1:00 to 3:00/i);

      fireEvent.focus(screen.getByRole('textbox', { name: /area 2 max time/i }));
      fireEvent.click(screen.getByRole('button', { name: '1:30' }));

      expect(screen.getByRole('textbox', { name: /area 1 max time/i })).toHaveValue('');
      expect(screen.getByRole('textbox', { name: /area 2 max time/i })).toHaveValue('1:30');
    });

    it('holds Save until the class rule is known, so a rulebook time is never typed over', async () => {
      render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
      await waitFor(() => expect(screen.getByRole('button', { name: /save/i })).toBeEnabled());
    });

    it('follows a rule change while open, so the inputs match what Save checks', async () => {
      getClass.mockResolvedValue({
        id: 'class-a',
        element: 'Container',
        level: 'Novice',
        timeLimitRule: { fixed: 120, forElement: 'Container', forLevel: 'Novice' },
      });
      render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
      expect(await screen.findByText(/set by the rulebook/i)).toBeInTheDocument();

      getClass.mockResolvedValue({
        id: 'class-a',
        element: 'Interior',
        level: 'Novice',
        timeLimitRule: { min: 60, max: 180, forElement: 'Interior', forLevel: 'Novice' },
      });
      await act(async () => listeners.forEach(listener => listener()));

      expect(await screen.findByText(/allowed: 1:00 to 3:00/i)).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /max time/i })).toBeInTheDocument();
    });

    it('enables Save even when the class read fails, so the error can show', async () => {
      getClass.mockRejectedValue(new Error('idb'));
      render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByRole('button', { name: /save/i })).toBeEnabled());
    });

    it('titles the class on one line and Max Time on the next, with no dash', () => {
      render(<MaxTimeDialog isOpen classData={classData} onClose={vi.fn()} />);
      expect(screen.getByText('Interior Novice A', { exact: true })).toBeInTheDocument();
      expect(screen.getByText('Max Time', { exact: true })).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('\u2014');
    });

    it('says the time is required when opened before scoring', async () => {
      render(<MaxTimeDialog isOpen showWarning classData={classData} onClose={vi.fn()} />);
      expect(screen.getByRole('status')).toHaveTextContent(/max time required before scoring/i);
    });
  });
});
