import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AKCScentWorkLiveScoresheet } from './AKC/AKCScentWorkLiveScoresheet';
import { ASCAScentDetectionLiveScoresheet } from './ASCA/ASCAScentDetectionLiveScoresheet';
import { UKCNoseworkLiveScoresheet } from './UKC/UKCNoseworkLiveScoresheet';
import type { LiveScoresheetProps, ResolvedClassRules } from '../../types';

// MYK9-1011: a max-time expiry must never overwrite a result the judge already
// chose (DQ, EX, ABS), and must still auto-set NQ "Max Time" when none is chosen.
// The timer callbacks are captured from the FIRST render only, so they hold a
// stale `scoring`: the guard has to read the current result from a ref.

const timers = vi.hoisted(() => ({
  firstStopwatch: undefined as undefined | { onTimeExpired?: (t: string) => void },
  firstElement: undefined as undefined | { onExpired?: () => void },
  elementStopReachedMax: false,
}));

vi.mock('../../hooks/useStopwatch', () => ({
  useStopwatch: (options: { onTimeExpired?: (t: string) => void }) => {
    timers.firstStopwatch ??= options;
    return {
      time: 0,
      isRunning: false,
      formatTime: () => '3:00.00',
      getRemainingTime: () => '3:00.00',
      getMaxTimeMs: () => 180000,
      getRemainingTimeMs: () => 180000,
      start: vi.fn(),
      pause: vi.fn(() => 180000),
      reset: vi.fn(),
      shouldShow30SecondWarning: () => false,
      isTimeExpired: () => false,
      getWarningMessage: () => null,
    };
  },
}));

vi.mock('../../hooks/useElementTimer', () => ({
  useElementTimer: (options: { onExpired?: () => void }) => {
    timers.firstElement ??= options;
    return {
      time: 0,
      isRunning: true,
      start: vi.fn(),
      stop: vi.fn(() => timers.elementStopReachedMax),
      resume: vi.fn(),
      reset: vi.fn(),
      formatTime: () => '0:00.00',
    };
  },
}));

const rules = (timerMode: 'single' | 'dual'): ResolvedClassRules => ({
  areaCount: 1,
  timerMode,
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
});

function props(timerMode: 'single' | 'dual' = 'single'): LiveScoresheetProps {
  return {
    entry: {
      id: '1',
      armband: 7,
      dogName: 'Rex',
      handlerName: 'Jane Smith',
      className: 'Class',
      element: 'Interior',
      level: 'Novice',
    },
    classInfo: { element: 'Interior', level: 'Novice' },
    rules: rules(timerMode),
    onSubmit: vi.fn(),
    onBack: vi.fn(),
  };
}

const sheets = [
  { name: 'AKC Scent Work', Sheet: AKCScentWorkLiveScoresheet },
  { name: 'ASCA Scent Detection', Sheet: ASCAScentDetectionLiveScoresheet },
  { name: 'UKC Nosework', Sheet: UKCNoseworkLiveScoresheet },
];

async function confirmedSubmit(onSubmit: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByTestId('submit-btn'));
  fireEvent.click(await screen.findByTestId('confirm-submit-btn'));
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  return onSubmit.mock.calls[0][0];
}

beforeEach(() => {
  timers.firstStopwatch = undefined;
  timers.firstElement = undefined;
  timers.elementStopReachedMax = false;
});

describe.each(sheets)('$name: search-timer expiry', ({ Sheet }) => {
  it.each(['DQ', 'EX', 'ABS'] as const)('keeps a judge-chosen %s', async code => {
    const p = props();
    render(<Sheet {...p} />);
    fireEvent.click(screen.getByTestId(`result-${code}`));
    if (code === 'DQ') {
      fireEvent.change(screen.getByTestId('dq-reason-input'), {
        target: { value: 'Attacked a person' },
      });
    }

    act(() => timers.firstStopwatch!.onTimeExpired!('3:00.00'));

    const data = await confirmedSubmit(p.onSubmit as ReturnType<typeof vi.fn>);
    expect(data.resultText).toBe(code);
    expect(data.nonQualifyingReason).not.toBe('Max Time');
    if (code === 'DQ') expect(data.nonQualifyingReason).toBe('Attacked a person');
  });

  it('still auto-sets NQ Max Time when no result is chosen', async () => {
    const p = props();
    render(<Sheet {...p} />);
    act(() => timers.firstStopwatch!.onTimeExpired!('3:00.00'));
    const data = await confirmedSubmit(p.onSubmit as ReturnType<typeof vi.fn>);
    expect(data.resultText).toBe('NQ');
    expect(data.nonQualifyingReason).toBe('Max Time');
  });

  it('still overrides a Qualified chosen before the expiry', async () => {
    const p = props();
    render(<Sheet {...p} />);
    fireEvent.click(screen.getByTestId('result-Q'));
    act(() => timers.firstStopwatch!.onTimeExpired!('3:00.00'));
    const data = await confirmedSubmit(p.onSubmit as ReturnType<typeof vi.fn>);
    expect(data.resultText).toBe('NQ');
    expect(data.nonQualifyingReason).toBe('Max Time');
  });
});

describe('UKC Nosework dual timer: element expiry and Finish at max', () => {
  it('keeps a DQ and its reason when the element timer expires', async () => {
    const p = props('dual');
    render(<UKCNoseworkLiveScoresheet {...p} />);
    fireEvent.click(screen.getByTestId('result-DQ'));
    fireEvent.change(screen.getByTestId('dq-reason-input'), {
      target: { value: 'Attacked a person' },
    });

    act(() => timers.firstElement!.onExpired!());

    const data = await confirmedSubmit(p.onSubmit as ReturnType<typeof vi.fn>);
    expect(data.resultText).toBe('DQ');
    expect(data.nonQualifyingReason).toBe('Attacked a person');
  });

  it('keeps a DQ and its reason when Finish is tapped past the max', async () => {
    timers.elementStopReachedMax = true;
    const p = props('dual');
    render(<UKCNoseworkLiveScoresheet {...p} />);
    fireEvent.click(screen.getByTestId('result-DQ'));
    fireEvent.change(screen.getByTestId('dq-reason-input'), {
      target: { value: 'Attacked a person' },
    });

    fireEvent.click(screen.getByRole('button', { name: /finish/i }));

    const data = await confirmedSubmit(p.onSubmit as ReturnType<typeof vi.fn>);
    expect(data.resultText).toBe('DQ');
    expect(data.nonQualifyingReason).toBe('Attacked a person');
  });

  it('still auto-sets NQ Max Time on element expiry and on Finish at max with no result', async () => {
    const expiry = props('dual');
    const first = render(<UKCNoseworkLiveScoresheet {...expiry} />);
    act(() => timers.firstElement!.onExpired!());
    let data = await confirmedSubmit(expiry.onSubmit as ReturnType<typeof vi.fn>);
    expect([data.resultText, data.nonQualifyingReason]).toEqual(['NQ', 'Max Time']);
    first.unmount();

    timers.firstStopwatch = undefined;
    timers.firstElement = undefined;
    timers.elementStopReachedMax = true;
    const finish = props('dual');
    render(<UKCNoseworkLiveScoresheet {...finish} />);
    fireEvent.click(screen.getByRole('button', { name: /finish/i }));
    data = await confirmedSubmit(finish.onSubmit as ReturnType<typeof vi.fn>);
    expect([data.resultText, data.nonQualifyingReason]).toEqual(['NQ', 'Max Time']);
  });
});
