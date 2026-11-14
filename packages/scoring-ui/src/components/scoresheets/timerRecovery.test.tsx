/**
 * MYK9-2007: after a reload mid-run the scoresheet says what happened to the
 * timer, in plain words, and a run that was going keeps going.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
import type { ResolvedClassRules, ScoresheetEntry } from '../../types';

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span />,
  RotateCcw: () => <span />,
  X: () => <span />,
  ClipboardCheck: () => <span />,
}));

const entry: ScoresheetEntry = {
  id: 'entry-9',
  armband: 9,
  dogName: 'Rex',
  handlerName: 'Jane Smith',
  className: 'Class',
};
const rules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};
const KEY = 'myk9:run-timer:entry-9:search';

function mount() {
  return render(
    <AKCScentWorkLiveScoresheet
      entry={entry}
      classInfo={{ element: 'Interior', level: 'Novice' }}
      rules={rules}
      onSubmit={vi.fn()}
      onBack={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('timer recovery notice (MYK9-2007)', () => {
  it('says nothing on a fresh sheet', () => {
    mount();
    expect(screen.queryByTestId('timer-recovery-notice')).not.toBeInTheDocument();
  });

  it('tells the judge a run that was going is still going', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ elapsedMs: 42_000, running: true, wallAt: Date.now() - 1000 })
    );
    mount();
    expect(screen.getByTestId('timer-recovery-notice')).toHaveTextContent(/still running/i);
    expect(screen.getByTestId('timer-stop')).toBeInTheDocument();
  });

  it('tells the judge plainly the time was lost, and what to do', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ elapsedMs: 42_000, running: true, wallAt: Date.now() + 60_000 })
    );
    mount();
    expect(screen.getByTestId('timer-recovery-notice')).toHaveTextContent(
      /time was lost\. Type the time, use max time, or run the dog again/i
    );
  });
});
