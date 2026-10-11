/**
 * MYK9-1103: a multi-area ASCA class (per area, like AKC) times each area against that area's own max.
 * The sheet used to hand the stopwatch area 1's time for every area, and an
 * expiry always wrote area 1.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASCAScentDetectionLiveScoresheet } from './ASCAScentDetectionLiveScoresheet';
import type { ResolvedClassRules } from '../../../types';

const clock = vi.hoisted(() => ({
  time: 0,
  isRunning: false,
  maxTimes: [] as Array<string | undefined>,
  onTimeExpired: undefined as undefined | ((t: string) => void),
  reset: () => {},
}));

vi.mock('../../../hooks/useStopwatch', () => ({
  useStopwatch: (options: { maxTime?: string; onTimeExpired?: (t: string) => void }) => {
    clock.maxTimes.push(options.maxTime);
    clock.onTimeExpired ??= options.onTimeExpired;
    return {
      time: clock.time,
      isRunning: clock.isRunning,
      formatTime: () => '0:45.00',
      getRemainingTime: () => '0:15.00',
      getMaxTimeMs: () => 60000,
      getRemainingTimeMs: () => 15000,
      start: vi.fn(),
      pause: vi.fn(() => clock.time),
      reset: () => clock.reset(),
      shouldShow30SecondWarning: () => false,
      isTimeExpired: () => false,
      getWarningMessage: () => null,
    };
  },
}));

const rules: ResolvedClassRules = {
  areaCount: 2,
  timerMode: 'single',
  maxTimeSeconds: 60,
  areaMaxTimeSeconds: [60, 120],
  hideCount: 2,
  hidesKnown: false,
  distractionCount: 0,
};

function renderSheet() {
  return render(
    <ASCAScentDetectionLiveScoresheet
      entry={{
        id: '1',
        armband: 7,
        dogName: 'Rex',
        handlerName: 'Jane Smith',
        className: 'Interior Advanced',
        element: 'Interior',
        level: 'Advanced',
      }}
      classInfo={{ element: 'Interior', level: 'Advanced' }}
      rules={rules}
      onSubmit={vi.fn()}
      onBack={vi.fn()}
    />
  );
}

const areaInputs = () => screen.getAllByRole('textbox', { name: /time$/ });

describe('ASCA live scoresheet: per-area max time (MYK9-1103)', () => {
  beforeEach(() => {
    clock.time = 0;
    clock.isRunning = false;
    clock.maxTimes = [];
    clock.onTimeExpired = undefined;
    clock.reset = () => {};
  });

  it('labels each area with its own max', () => {
    renderSheet();
    expect(screen.getByText('Max: 1:00')).toBeInTheDocument();
    expect(screen.getByText('Max: 2:00')).toBeInTheDocument();
  });

  it('times area 1 against 1:00, then area 2 against 2:00 once area 1 has a time', () => {
    renderSheet();
    expect(clock.maxTimes.at(-1)).toBe('1:00');

    fireEvent.change(areaInputs()[0]!, { target: { value: '0:50.00' } });
    expect(clock.maxTimes.at(-1)).toBe('2:00');
  });

  it('writes an expiry into the area being timed, not area 1', () => {
    renderSheet();
    fireEvent.change(areaInputs()[0]!, { target: { value: '0:50.00' } });

    act(() => clock.onTimeExpired?.('2:00.00'));

    expect(areaInputs()[0]).toHaveValue('0:50.00');
    expect(areaInputs()[1]).toHaveValue('2:00.00');
  });

  it('records a stopped clock into the timed area and resets it', () => {
    clock.time = 45000;
    const reset = vi.fn();
    clock.reset = reset;
    renderSheet();

    fireEvent.click(screen.getByTestId('timer-record-area'));

    expect(areaInputs()[0]).toHaveValue('0:45.00');
    expect(reset).toHaveBeenCalled();
  });
});
