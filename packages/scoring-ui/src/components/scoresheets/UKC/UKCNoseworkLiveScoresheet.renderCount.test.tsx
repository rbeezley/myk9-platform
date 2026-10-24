import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UKCNoseworkLiveScoresheet } from './UKCNoseworkLiveScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

// MYK9-1364: the real stopwatch runs here (no hook mock). ScoresheetDogCard is not
// memoised, so it renders once per render of the scoresheet body -- a host-render
// counter.
const body = vi.hoisted(() => ({ renders: 0 }));
vi.mock('../../ScoresheetDogCard', () => ({
  ScoresheetDogCard: () => {
    body.renders += 1;
    return null;
  },
}));

const entry: ScoresheetEntry = {
  id: '1',
  armband: 42,
  dogName: 'Pepper',
  handlerName: 'Alex Johnson',
  className: 'UKC Nosework',
  element: 'Container',
  level: 'Novice',
};
const classInfo: ScoresheetClassInfo = { element: 'Container', level: 'Novice' };
const rules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 120,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

describe('UKCNoseworkLiveScoresheet render budget (MYK9-1364)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    body.renders = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not re-render the scoresheet body for the running clock', () => {
    render(
      <UKCNoseworkLiveScoresheet
        entry={entry}
        classInfo={classInfo}
        rules={rules}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('timer-start'));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const afterStart = body.renders;
    const shownAtStart = screen.getByTestId('search-timer-display').textContent;

    // Three seconds, one act per display frame (60fps).
    for (let frame = 0; frame < 180; frame += 1) {
      act(() => {
        vi.advanceTimersByTime(1000 / 60);
      });
    }

    const during = body.renders - afterStart;
    expect(during).toBe(0);
    const shown = screen.getByTestId('search-timer-display').textContent;
    expect(shown).not.toBe(shownAtStart);
    expect(shown).toMatch(/^0:0[23]\.\d\d$/);

    // Stop is a transition the body shows: it re-renders (Resume appears).
    fireEvent.click(screen.getByTestId('timer-stop'));
    expect(body.renders - afterStart).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });

  it('does not re-render the scoresheet body for the element clock in dual mode (MYK9-1375)', () => {
    render(
      <UKCNoseworkLiveScoresheet
        entry={entry}
        classInfo={classInfo}
        rules={{ ...rules, timerMode: 'dual', maxTimeSeconds: 600 }}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('timer-start'));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const afterStart = body.renders;
    const row = screen.getByTestId('element-timer-row');
    const shownAtStart = row.textContent;

    for (let frame = 0; frame < 180; frame += 1) {
      act(() => {
        vi.advanceTimersByTime(1000 / 60);
      });
    }

    expect(body.renders - afterStart).toBe(0);
    expect(row.textContent).not.toBe(shownAtStart);
    expect(row.textContent).toMatch(/0:0[23]\.\d\d/);
    // Running counts as started: Start gave way to Pause Search with no tick render.
    expect(screen.getByTestId('timer-pause')).toBeInTheDocument();
  });

  it('saves the live element time when Save is tapped with the element clock running', async () => {
    const onSubmit = vi.fn();
    render(
      <UKCNoseworkLiveScoresheet
        entry={entry}
        classInfo={classInfo}
        rules={{ ...rules, timerMode: 'dual', maxTimeSeconds: 600 }}
        onSubmit={onSubmit}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('timer-start'));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // No Finish: the judge records Excused while both clocks still run.
    fireEvent.click(screen.getByTestId('result-EX'));
    fireEvent.click(screen.getByTestId('submit-btn'));
    expect(screen.getByTestId('confirmation-dialog')).toHaveTextContent(/0:0[23]\.\d\d/);
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-submit-btn'));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ element: expect.stringMatching(/^0:0[23]\.\d\d$/) })
    );
  });
});
