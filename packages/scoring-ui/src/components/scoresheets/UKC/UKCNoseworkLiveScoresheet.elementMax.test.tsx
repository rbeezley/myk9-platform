/**
 * MYK9-1093 — in dual-timer UKC classes (Superior / Master / Elite) the rulebook
 * maximum is an ELEMENT time: the element clock runs continuously while the search
 * clock pauses at each alert, and "searches are not allowed to go over the
 * designated Element Times". Real timers here (the sibling test mocks them).
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UKCNoseworkLiveScoresheet } from './UKCNoseworkLiveScoresheet';
import type { ScoresheetClassInfo, ScoresheetEntry, ResolvedClassRules } from '../../../types';

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
}));

const entry: ScoresheetEntry = {
  id: '1',
  armband: 42,
  dogName: 'Pepper',
  handlerName: 'Alex Johnson',
  className: 'UKC Nosework',
  element: 'Container',
  level: 'Superior',
};
const classInfo: ScoresheetClassInfo = { element: 'Container', level: 'Superior' };
const rules = (timerMode: 'single' | 'dual'): ResolvedClassRules => ({
  areaCount: 1,
  timerMode,
  maxTimeSeconds: 10,
  hideCount: 2,
  hidesKnown: false,
  distractionCount: 0,
});

function renderSheet(timerMode: 'single' | 'dual') {
  return render(
    <UKCNoseworkLiveScoresheet
      entry={entry}
      classInfo={classInfo}
      rules={rules(timerMode)}
      onSubmit={vi.fn()}
      onBack={vi.fn()}
    />
  );
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('UKC dual-timer max time is the element time (MYK9-1093)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops and NQs "Max Time" when the ELEMENT clock reaches the max, search paused or not', () => {
    renderSheet('dual');
    fireEvent.click(screen.getByTestId('timer-start'));
    advance(3000);
    // Handler calls an alert: the search clock pauses, the element clock runs on.
    fireEvent.click(screen.getByTestId('timer-pause'));
    advance(7500);

    // Element time hit 0:10 while search time read ~0:03.
    expect(screen.getByTestId('nq-reason-select')).toHaveValue('Max Time');
    expect(screen.getByTestId('ukc-recorded-time')).toHaveValue('0:03.00');
    expect(screen.queryByTestId('timer-resume')).not.toBeInTheDocument();
  });

  it('never lets the search clock run past the element max', () => {
    renderSheet('dual');
    fireEvent.click(screen.getByTestId('timer-start'));
    advance(12_000);

    expect(screen.getByTestId('nq-reason-select')).toHaveValue('Max Time');
    expect(screen.getByTestId('ukc-recorded-time')).toHaveValue('0:10.00');
  });

  it('single-timer classes still expire on the search clock', () => {
    renderSheet('single');
    fireEvent.click(screen.getByTestId('timer-start'));
    advance(10_500);

    expect(screen.getByTestId('nq-reason-select')).toHaveValue('Max Time');
    expect(screen.getByTestId('ukc-recorded-time')).toHaveValue('0:10.00');
  });

  it('chimes the 30-second warning on element time while the search is paused', () => {
    const onWarningChime = vi.fn();
    render(
      <UKCNoseworkLiveScoresheet
        entry={entry}
        classInfo={classInfo}
        rules={{ ...rules('dual'), maxTimeSeconds: 60 }}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        onWarningChime={onWarningChime}
      />
    );
    fireEvent.click(screen.getByTestId('timer-start'));
    advance(5000);
    fireEvent.click(screen.getByTestId('timer-pause'));
    // Element 0:29 (31s left) with search frozen at 0:05: no warning yet.
    advance(24_000);
    expect(onWarningChime).not.toHaveBeenCalled();
    // Element 0:31: 29s left on the element clock.
    advance(2_000);

    expect(onWarningChime).toHaveBeenCalledTimes(1);
    expect(screen.getByText('30 Second Warning')).toBeInTheDocument();
  });

  it('caps the recorded search time at the max when expiry is noticed late (locked phone)', () => {
    renderSheet('dual');
    fireEvent.click(screen.getByTestId('timer-start'));
    // The phone sleeps: wall clock moves 20s with no timer ticks, then one tick.
    vi.setSystemTime(Date.now() + 20_000);
    advance(100);

    expect(screen.getByTestId('nq-reason-select')).toHaveValue('Max Time');
    expect(screen.getByTestId('ukc-recorded-time')).toHaveValue('0:10.00');
  });

  it('Finish tapped just past the max (before a tick) still records Max Time', () => {
    renderSheet('dual');
    fireEvent.click(screen.getByTestId('timer-start'));
    advance(9_900);
    vi.setSystemTime(Date.now() + 150); // past 0:10, no tick yet
    fireEvent.click(screen.getByRole('button', { name: /^finish$/i }));

    expect(screen.getByTestId('nq-reason-select')).toHaveValue('Max Time');
    expect(screen.getByTestId('ukc-recorded-time')).toHaveValue('0:10.00');
  });

  it('warns at 30 seconds on the element clock at UKC Master too', () => {
    const onWarningChime = vi.fn();
    render(
      <UKCNoseworkLiveScoresheet
        entry={{ ...entry, level: 'Master' }}
        classInfo={{ ...classInfo, level: 'Master' }}
        rules={{ ...rules('dual'), maxTimeSeconds: 60 }}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        onWarningChime={onWarningChime}
      />
    );
    fireEvent.click(screen.getByTestId('timer-start'));
    advance(31_000);

    expect(onWarningChime).toHaveBeenCalledTimes(1);
  });
});
