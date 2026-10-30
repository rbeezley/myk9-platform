/**
 * MYK9-1500: Up and the bottom Cancel call `onBack` directly; the sheet reports
 * whether something would be lost, and the host's route guard owns the single
 * "Discard this score?" prompt.
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

function renderSheet(onBack = vi.fn(), onDirtyChange = vi.fn()) {
  render(
    <AKCScentWorkLiveScoresheet
      entry={entry}
      classInfo={classInfo}
      rules={rules}
      onSubmit={vi.fn()}
      onBack={onBack}
      onDirtyChange={onDirtyChange}
    />
  );
  return { onBack, onDirtyChange };
}

const leaveControls: [string, () => HTMLElement][] = [
  ['Up', () => screen.getByRole('button', { name: 'Entries' })],
  ['Cancel', () => screen.getByRole('button', { name: 'Cancel' })],
];

describe('scoresheet leave', () => {
  beforeEach(() => {
    clock.ms = 0;
    clock.running = false;
  });

  it.each(leaveControls)('%s calls onBack at once, with no prompt of its own', (_n, control) => {
    const { onBack } = renderSheet();
    fireEvent.click(screen.getByTestId('result-Q'));
    fireEvent.click(control());
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard this score?')).toBeNull();
  });

  it('reports clean for an untouched sheet', () => {
    const { onDirtyChange } = renderSheet();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it('reports dirty once a result is chosen', () => {
    const { onDirtyChange } = renderSheet();
    fireEvent.click(screen.getByTestId('result-Q'));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('reports dirty when a time is typed', () => {
    const { onDirtyChange } = renderSheet();
    fireEvent.change(screen.getByLabelText('Area 1 time'), { target: { value: '1:05.00' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('reports dirty when the timer has run', () => {
    clock.ms = 4200;
    const { onDirtyChange } = renderSheet();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
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
