/**
 * MYK9-1086: the ringside "Set Max Time" dialog saves the class's max time.
 *
 * Value-sensitive: the time must reach replicatedClassesTable.updateClass as seconds
 * (so the offline queue routes it through ringside_update_class), for both classes
 * of a combined A/B pair.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';

const { updateClass, getClass, resolveRules, getTrial } = vi.hoisted(() => ({
  updateClass: vi.fn(),
  getClass: vi.fn(),
  resolveRules: vi.fn(),
  getTrial: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass, get: getClass },
  replicatedTrialsTable: { getTrialById: getTrial },
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
      timeLimitRule: { min: 60, max: 180, forElement: 'Interior', forLevel: 'Novice' },
    });
    resolveRules.mockReset().mockResolvedValue(new Map());
    getTrial.mockReset().mockResolvedValue({ id: 't1', registryId: 'AKC' });
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

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
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
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t check/i);
    expect(updateClass).not.toHaveBeenCalled();
  });

  describe('multi-area class (MYK9-1098)', () => {
    const twoAreas = {
      ...classData,
      level: 'Excellent',
      class_name: 'Interior Excellent A',
      area_count: 2,
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
      expect(await screen.findByRole('textbox', { name: /area 1 max time/i })).toHaveValue('1:30');
      expect(areaInput(2)).toHaveValue('');

      fireEvent.change(areaInput(2), { target: { value: '2:30' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      const expected = { timeLimitSeconds: 90, timeLimitArea2Seconds: 150 };
      await waitFor(() => expect(updateClass).toHaveBeenCalledTimes(2));
      expect(updateClass).toHaveBeenCalledWith('class-a', expected);
      expect(updateClass).toHaveBeenCalledWith('class-b', expected);
    });

    it('needs every area before saving', async () => {
      render(<MaxTimeDialog isOpen classData={twoAreas} onClose={vi.fn()} />);
      await screen.findByRole('textbox', { name: /area 2 max time/i });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      expect(screen.getByRole('alert')).toHaveTextContent(/area 2 max time/i);
      expect(updateClass).not.toHaveBeenCalled();
    });

    it('range-checks every area, not just area 1', async () => {
      render(<MaxTimeDialog isOpen classData={twoAreas} onClose={vi.fn()} />);
      await screen.findByRole('textbox', { name: /area 2 max time/i });
      fireEvent.change(areaInput(2), { target: { value: '5:00' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/1:00 and 3:00/);
      expect(updateClass).not.toHaveBeenCalled();
    });

    it('keeps one time for an ASCA class, whose scoresheet does not time areas separately', async () => {
      getTrial.mockResolvedValue({ id: 't1', registryId: 'ASCA' });
      render(<MaxTimeDialog isOpen classData={twoAreas} onClose={vi.fn()} />);
      await waitFor(() => expect(getTrial).toHaveBeenCalled());

      expect(screen.getAllByRole('textbox')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() =>
        expect(updateClass).toHaveBeenCalledWith('class-a', { timeLimitSeconds: 90 })
      );
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
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() =>
        expect(updateClass).toHaveBeenCalledWith('class-a', { timeLimitSeconds: 150 })
      );
    });

    it('fills the area the judge last tapped', async () => {
      render(
        <MaxTimeDialog isOpen classData={{ ...classData, area_count: 2 }} onClose={vi.fn()} />
      );
      await screen.findByText(/allowed: 1:00 to 3:00/i);

      fireEvent.focus(screen.getByRole('textbox', { name: /area 2 max time/i }));
      fireEvent.click(screen.getByRole('button', { name: '1:30' }));

      expect(screen.getByRole('textbox', { name: /area 1 max time/i })).toHaveValue('');
      expect(screen.getByRole('textbox', { name: /area 2 max time/i })).toHaveValue('1:30');
    });

    it('says the time is required when opened before scoring', () => {
      render(<MaxTimeDialog isOpen showWarning classData={classData} onClose={vi.fn()} />);
      expect(screen.getByRole('status')).toHaveTextContent(/max time required before scoring/i);
    });
  });
});
