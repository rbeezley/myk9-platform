/**
 * MYK9-1500: leaving a scoresheet asks "Discard this score?" only when something
 * would be lost; the Up control and the bottom Cancel behave the same.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../types';

const clock = vi.hoisted(() => ({ ms: 0, running: false }));

vi.mock('../../hooks/useStopwatch', () => ({
  useStopwatch: () => ({
    time: 0,
    subscribeTime: () => () => undefined,
    getTimeMs: () => clock.ms,
    get isRunning() {
      return clock.running;
    },
    formatTime: () => '0:00.00',
    getRemainingTime: () => '3:00.00',
    getMaxTimeMs: () => 180000,
    getRemainingTimeMs: () => 180000,
    start: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    shouldShow30SecondWarning: () => false,
    isTimeExpired: () => false,
    getWarningMessage: () => null,
  }),
}));

const entry: ScoresheetEntry = {
  id: '1',
  armband: 42,
  dogName: 'Rex',
  handlerName: 'Jane Smith',
  className: 'AKC Scent Work',
  element: 'Interior',
  level: 'Novice',
};
const classInfo: ScoresheetClassInfo = { element: 'Interior', level: 'Novice' };
const rules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

function renderSheet(onBack = vi.fn()) {
  render(
    <AKCScentWorkLiveScoresheet
      entry={entry}
      classInfo={classInfo}
      rules={rules}
      onSubmit={vi.fn()}
      onBack={onBack}
    />
  );
  return onBack;
}

const leaveControls: [string, () => HTMLElement][] = [
  ['Up', () => screen.getByRole('button', { name: 'Entries' })],
  ['Cancel', () => screen.getByRole('button', { name: 'Cancel' })],
];

describe('scoresheet leave guard', () => {
  beforeEach(() => {
    clock.ms = 0;
    clock.running = false;
  });

  it.each(leaveControls)('%s leaves an untouched sheet without a prompt', (_name, control) => {
    const onBack = renderSheet();
    fireEvent.click(control());
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard this score?')).toBeNull();
  });

  it.each(leaveControls)('%s asks first once a result is chosen', (_name, control) => {
    const onBack = renderSheet();
    fireEvent.click(screen.getByTestId('result-Q'));
    fireEvent.click(control());
    expect(screen.getByText('Discard this score?')).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep scoring' }));
    expect(screen.queryByText('Discard this score?')).toBeNull();
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(control());
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it.each(leaveControls)('%s asks first when a time is typed', (_name, control) => {
    const onBack = renderSheet();
    fireEvent.change(screen.getByLabelText('Area 1 time'), { target: { value: '1:05.00' } });
    fireEvent.click(control());
    expect(screen.getByText('Discard this score?')).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });

  it.each(leaveControls)('%s asks first when the timer has run', (_name, control) => {
    clock.ms = 4200;
    const onBack = renderSheet();
    fireEvent.click(control());
    expect(screen.getByText('Discard this score?')).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('labels the Up control with backLabel when given', () => {
    render(
      <AKCScentWorkLiveScoresheet
        entry={entry}
        classInfo={classInfo}
        rules={rules}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        backLabel="Classes"
      />
    );
    expect(screen.getByRole('button', { name: 'Classes' })).toBeInTheDocument();
  });
});
