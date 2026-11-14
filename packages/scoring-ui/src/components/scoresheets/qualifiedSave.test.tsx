/**
 * MYK9-2004: the scoresheet refuses an invalid Qualified. Q needs a time above
 * zero and at or under the limit in every area, UKC and ASCA Q need a fault count
 * within the rulebook limit, and the app never changes the result by itself.
 * Real timers: the expiry path runs through the real stopwatch.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
import { ASCAScentDetectionLiveScoresheet } from './ASCA/ASCAScentDetectionLiveScoresheet';
import { UKCNoseworkLiveScoresheet } from './UKC/UKCNoseworkLiveScoresheet';
import type { ResolvedClassRules, ScoresheetClassInfo, ScoresheetEntry } from '../../types';

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span />,
  RotateCcw: () => <span />,
  X: () => <span />,
  ClipboardCheck: () => <span />,
}));

const entry: ScoresheetEntry = {
  id: '1',
  armband: 42,
  dogName: 'Rex',
  handlerName: 'Jane Smith',
  className: 'Class',
  element: 'Interior',
  level: 'Novice',
};
const info = (level = 'Novice'): ScoresheetClassInfo => ({ element: 'Interior', level });
const rules = (over: Partial<ResolvedClassRules> = {}): ResolvedClassRules => ({
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
  ...over,
});

const Q_NEEDS_TIME = 'Add a time to save a Qualified';
const save = () => screen.getByTestId('submit-btn');
const pickQ = () => fireEvent.click(screen.getByTestId('result-Q'));
const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

afterEach(() => {
  vi.useRealTimers();
});

describe('AKC single area', () => {
  const mount = (over: Partial<ResolvedClassRules> = {}) =>
    render(
      <AKCScentWorkLiveScoresheet
        entry={entry}
        classInfo={info()}
        rules={rules(over)}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );

  it('refuses a Qualified with a blank time and says why', () => {
    mount();
    pickQ();
    expect(save()).toBeDisabled();
    expect(screen.getByText(Q_NEEDS_TIME)).toBeInTheDocument();
  });

  it('refuses a Qualified over the limit and names both times', () => {
    mount();
    type('Area 1 time', '3:40.00');
    pickQ();
    expect(save()).toBeDisabled();
    expect(
      screen.getByText('3:40 is over the 3:00 limit. Fix the time, or choose NQ.')
    ).toBeInTheDocument();
  });

  it('saves a Qualified at exactly the limit', () => {
    mount();
    type('Area 1 time', '3:00.00');
    pickQ();
    expect(save()).toBeEnabled();
    expect(screen.queryByText(Q_NEEDS_TIME)).not.toBeInTheDocument();
  });

  it('Use max time sets the limit in one tap and enables Save', () => {
    mount();
    pickQ();
    fireEvent.click(screen.getByRole('button', { name: /use max time/i }));
    expect(screen.getByLabelText('Area 1 time')).toHaveValue('3:00.00');
    expect(save()).toBeEnabled();
  });

  it.each(['NQ', 'ABS', 'EX', 'DQ'])('%s never needs a time', result => {
    mount();
    fireEvent.click(screen.getByTestId(`result-${result}`));
    expect(screen.queryByText(Q_NEEDS_TIME)).not.toBeInTheDocument();
    if (result !== 'DQ') expect(save()).toBeEnabled();
  });

  it('after the timer runs out it sets NQ Max Time, and tapping Qualified then saves', () => {
    vi.useFakeTimers();
    mount({ maxTimeSeconds: 5 });
    fireEvent.click(screen.getByTestId('timer-start'));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByTestId('result-NQ').className).toMatch(/bg-red-600/);
    pickQ();
    expect(screen.getByLabelText('Area 1 time')).toHaveValue('0:05.00');
    expect(save()).toBeEnabled();
  });
});

describe('AKC multi area', () => {
  it('refuses a Qualified until every area has a time, then each is checked against its own limit', () => {
    render(
      <AKCScentWorkLiveScoresheet
        entry={entry}
        classInfo={info()}
        rules={rules({ areaCount: 2, areaMaxTimeSeconds: [180, 120] })}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );
    pickQ();
    type('Area 1 time', '1:00.00');
    expect(save()).toBeDisabled();
    expect(screen.getByText(Q_NEEDS_TIME)).toBeInTheDocument();
    type('Area 2 time', '2:30.00');
    expect(save()).toBeDisabled();
    expect(
      screen.getByText('2:30 is over the 2:00 limit. Fix the time, or choose NQ.')
    ).toBeInTheDocument();
    type('Area 2 time', '2:00.00');
    expect(save()).toBeEnabled();
  });
});

describe('UKC Nosework', () => {
  const mount = (over: Partial<ResolvedClassRules> = {}, level = 'Superior') =>
    render(
      <UKCNoseworkLiveScoresheet
        entry={entry}
        classInfo={info(level)}
        rules={rules(over)}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );

  it('refuses a dual-timer Qualified when Finish was never tapped', () => {
    mount({ timerMode: 'dual' });
    pickQ();
    expect(screen.getByTestId('ukc-recorded-time')).toHaveValue('');
    expect(save()).toBeDisabled();
    expect(screen.getByText(Q_NEEDS_TIME)).toBeInTheDocument();
  });

  it('refuses a Qualified over the one-fault limit and names the limit', () => {
    mount();
    type('Recorded time', '1:00.00');
    pickQ();
    fireEvent.click(screen.getByTestId('fault-increase'));
    expect(save()).toBeEnabled();
    fireEvent.click(screen.getByTestId('fault-increase'));
    expect(screen.getByTestId('fault-count')).toHaveTextContent('2');
    expect(save()).toBeDisabled();
    expect(
      screen.getByText('2 faults is over the UKC limit of 1. Remove a fault, or choose NQ.')
    ).toBeInTheDocument();
    // The result is the judge's: nothing switched it to NQ.
    expect(screen.getByTestId('result-Q').className).toMatch(/bg-green-600/);
  });

  it('lets an NQ carry any number of faults', () => {
    mount();
    fireEvent.click(screen.getByTestId('result-NQ'));
    fireEvent.click(screen.getByTestId('fault-increase'));
    fireEvent.click(screen.getByTestId('fault-increase'));
    expect(save()).toBeEnabled();
  });
});

describe('ASCA Scent Detection', () => {
  const mount = (level: string) =>
    render(
      <ASCAScentDetectionLiveScoresheet
        entry={entry}
        classInfo={info(level)}
        rules={rules()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );

  it.each([
    ['Novice', 2],
    ['Open', 2],
    ['Advanced', 1],
    ['Excellent', 1],
  ])('%s: a Qualified over %i fault(s) is refused with the limit named', (level, max) => {
    mount(level);
    type('Area 1 time', '1:00.00');
    pickQ();
    for (let i = 0; i < max; i++) fireEvent.click(screen.getByTestId('fault-increment'));
    expect(save()).toBeEnabled();
    fireEvent.click(screen.getByTestId('fault-increment'));
    expect(save()).toBeDisabled();
    expect(
      screen.getByText(
        `${max + 1} faults is over the ASCA limit of ${max}. Remove a fault, or choose NQ.`
      )
    ).toBeInTheDocument();
  });
});
