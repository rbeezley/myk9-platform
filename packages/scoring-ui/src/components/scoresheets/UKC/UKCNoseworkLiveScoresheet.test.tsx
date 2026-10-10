import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { UKCNoseworkLiveScoresheet } from './UKCNoseworkLiveScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

// Mock useStopwatch to avoid real timers in tests. `stopwatchState` lets a test
// put the clock mid-run, with the last painted `time` behind the exact value.
const stopwatchState = vi.hoisted(() => ({ isRunning: false, time: 0, exactMs: 0 }));
vi.mock('../../../hooks/useStopwatch', () => ({
  useStopwatch: () => ({
    time: stopwatchState.time,
    isRunning: stopwatchState.isRunning,
    formatTime: (ms: number) => {
      const s = ms / 1000;
      return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
    },
    start: vi.fn(),
    pause: vi.fn(() => stopwatchState.exactMs),
    reset: vi.fn(),
    getRemainingTime: () => '3:00.00',
    getMaxTimeMs: () => 180000,
    getRemainingTimeMs: () => 180000,
    shouldShow30SecondWarning: () => false,
    isTimeExpired: () => false,
    getWarningMessage: () => null,
  }),
}));

vi.mock('../../../hooks/useElementTimer', () => ({
  useElementTimer: () => ({
    time: 0,
    isRunning: false,
    start: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    formatTime: (ms: number) => {
      const s = ms / 1000;
      return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
    },
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: '1',
  armband: 42,
  dogName: 'Pepper',
  handlerName: 'Alex Johnson',
  className: 'UKC Nosework',
  element: 'Container',
  level: 'Novice',
};

const defaultClassInfo: ScoresheetClassInfo = { element: 'Container', level: 'Novice' };

const singleRules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 120,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

const dualRules: ResolvedClassRules = {
  areaCount: 2,
  timerMode: 'dual',
  maxTimeSeconds: 180,
  hideCount: 3,
  hidesKnown: false,
  distractionCount: 0,
};

const defaultProps = {
  entry: defaultEntry,
  classInfo: defaultClassInfo,
  rules: singleRules,
  onSubmit: vi.fn(),
  onBack: vi.fn(),
};

describe('UKCNoseworkLiveScoresheet', () => {
  afterEach(() => {
    Object.assign(stopwatchState, { isRunning: false, time: 0, exactMs: 0 });
  });

  it('Stop records the exact time pause returns, not the last painted frame', () => {
    // The display repaints every 100ms, so `time` can trail the real clock.
    Object.assign(stopwatchState, { isRunning: true, time: 83380, exactMs: 83470 });
    render(<UKCNoseworkLiveScoresheet {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));

    expect(screen.getByTestId('ukc-recorded-time')).toHaveValue('1:23.47');
  });

  it('renders entry info (dog name, armband, handler)', () => {
    render(<UKCNoseworkLiveScoresheet {...defaultProps} />);

    expect(screen.getByText('Pepper')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/Alex Johnson/)).toBeInTheDocument();
  });

  it('single timer: only search timer renders when rules.timerMode is single', () => {
    render(<UKCNoseworkLiveScoresheet {...defaultProps} rules={singleRules} />);

    // Search timer display is present
    expect(screen.getByTestId('search-timer-display')).toBeInTheDocument();
    // Element timer row should NOT be present
    expect(screen.queryByTestId('element-timer-row')).not.toBeInTheDocument();
  });

  // MYK9-1086 (owner): pinned in the card corner, the ring covered the element row's time
  // and Finish button. Dual mode carries it inside that row; single mode keeps the corner.
  it('places the max-time ring in the element row in dual mode and in the corner otherwise', () => {
    const { unmount } = render(<UKCNoseworkLiveScoresheet {...defaultProps} rules={dualRules} />);
    const dualRings = screen.getAllByTestId('max-time-ring');
    expect(dualRings).toHaveLength(1);
    expect(screen.getByTestId('element-timer-row')).toContainElement(dualRings[0]!);
    unmount();

    render(<UKCNoseworkLiveScoresheet {...defaultProps} rules={singleRules} />);
    const singleRings = screen.getAllByTestId('max-time-ring');
    expect(singleRings).toHaveLength(1);
    expect(singleRings[0]!.getAttribute('class')).toContain('absolute');
  });

  it('dual timer: both search and element timer render when rules.timerMode is dual', () => {
    render(<UKCNoseworkLiveScoresheet {...defaultProps} rules={dualRules} />);

    expect(screen.getByTestId('search-timer-display')).toBeInTheDocument();
    expect(screen.getByTestId('element-timer-row')).toBeInTheDocument();
  });

  // MYK9-1086 (owner): UKC Nosework is always one search area, and UKC judges
  // never record found/correct. A class record claiming 3 areas still gets one.
  it('shows one recorded time and no found/correct, even for a multi-area class record', () => {
    const threeAreaRules: ResolvedClassRules = { ...singleRules, areaCount: 3 };
    render(<UKCNoseworkLiveScoresheet {...defaultProps} rules={threeAreaRules} />);

    expect(screen.getAllByTestId('ukc-recorded-time')).toHaveLength(1);
    expect(screen.getByLabelText('Recorded time')).toBeInTheDocument();
    expect(screen.queryByLabelText(/found/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/correct$/i)).not.toBeInTheDocument();
  });

  it('saves no find counts and no FOUND/CORRECT words for a UKC score', async () => {
    const onSubmit = vi.fn();
    render(<UKCNoseworkLiveScoresheet {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('ukc-recorded-time'), { target: { value: '1:12.48' } });
    fireEvent.click(screen.getByTestId('result-Q'));
    fireEvent.click(screen.getByTestId('submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          resultText: 'Q',
          correctCount: 0,
          incorrectCount: 0,
          areas: { 'area 1': '1:12.48' },
          areaTimes: ['1:12.48'],
        })
      );
    });
  });

  it('result chips render (Q, NQ, ABS, EX)', () => {
    render(<UKCNoseworkLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('result-Q')).toBeInTheDocument();
    expect(screen.getByTestId('result-NQ')).toBeInTheDocument();
    expect(screen.getByTestId('result-ABS')).toBeInTheDocument();
    expect(screen.getByTestId('result-EX')).toBeInTheDocument();
  });

  it('calls onSubmit with ScoreData when confirmed', async () => {
    const onSubmit = vi.fn();
    render(<UKCNoseworkLiveScoresheet {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('result-Q'));
    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirm-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          resultText: 'Q',
        })
      );
    });
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<UKCNoseworkLiveScoresheet {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });
});
