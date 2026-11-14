/**
 * MYK9-2007: after a reload mid-run the scoresheet says what happened to the
 * timer, in plain words, and a run that was going keeps going.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
import { AKCNationalsLiveScoresheet } from './AKC/AKCNationalsLiveScoresheet';
import type { ScoreData } from '../../types/scoreData';
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

describe('a saved score retires its timer (MYK9-2007)', () => {
  it('clears the timer kept for the entry once the score is saved', async () => {
    vi.useRealTimers();
    localStorage.setItem(
      KEY,
      JSON.stringify({ elapsedMs: 42_000, running: false, wallAt: Date.now() - 1000 })
    );
    const onSubmit = vi.fn();
    render(
      <AKCScentWorkLiveScoresheet
        entry={entry}
        classInfo={{ element: 'Interior', level: 'Novice' }}
        rules={rules}
        onSubmit={onSubmit}
        onBack={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('Area 1 time'), { target: { value: '0:42.00' } });
    fireEvent.click(screen.getByTestId('result-NQ'));
    fireEvent.click(screen.getByTestId('submit-btn'));
    fireEvent.click(await screen.findByTestId('confirm-submit-btn'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
  });

  it('opens a correction with no stale timer from before the save', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ elapsedMs: 42_000, running: false, wallAt: Date.now() - 1000 })
    );
    render(
      <AKCScentWorkLiveScoresheet
        entry={{ ...entry, hasSavedScore: true }}
        classInfo={{ element: 'Interior', level: 'Novice' }}
        rules={rules}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.queryByTestId('timer-recovery-notice')).not.toBeInTheDocument();
    expect(screen.getByTestId('timer-start')).toBeInTheDocument();
  });
});

describe('Nationals reopened score is not dirty until edited (MYK9-2006)', () => {
  const saved: ScoreData = {
    resultText: 'Q',
    searchTime: '1:10.00',
    areas: { 'area 1': '1:10.00 NOT FOUND INCORRECT' },
    areaTimes: ['1:10.00'],
    correctCount: 2,
    incorrectCount: 1,
    faultCount: 0,
    finishCallErrors: 1,
    points: 15,
  };

  it('reports clean on open and dirty after a counter changes', () => {
    const onDirtyChange = vi.fn();
    render(
      <AKCNationalsLiveScoresheet
        entry={{ ...entry, existingScore: saved }}
        classInfo={{ element: 'Interior', level: 'Novice' }}
        rules={{ ...rules, areaCount: 2 }}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        onDirtyChange={onDirtyChange}
      />
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByTestId('correct-inc'));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
