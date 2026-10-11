import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AKCFastCatLiveScoresheet } from './AKCFastCatLiveScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

// Mock useStopwatch to avoid real timers in tests
vi.mock('../../../hooks/useStopwatch', () => ({
  useStopwatch: () => ({
    time: 0,
    isRunning: false,
    formatTime: (ms: number) => {
      const s = ms / 1000;
      return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
    },
    start: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    getRemainingTime: () => '',
    getMaxTimeMs: () => 0,
    getRemainingTimeMs: () => 0,
    shouldShow30SecondWarning: () => false,
    isTimeExpired: () => false,
    getWarningMessage: () => null,
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Zap: () => <span data-testid="icon-zap" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: '1',
  armband: 42,
  dogName: 'Dash',
  handlerName: 'Jane Smith',
  className: 'AKC FastCAT',
};

const defaultClassInfo: ScoresheetClassInfo = { element: 'FastCAT', level: 'All' };

const defaultRules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 60,
  hideCount: 0,
  hidesKnown: false,
  distractionCount: 0,
};

const defaultProps = {
  entry: defaultEntry,
  classInfo: defaultClassInfo,
  rules: defaultRules,
  onSubmit: vi.fn(),
  onBack: vi.fn(),
};

describe('AKCFastCatLiveScoresheet', () => {
  it('renders entry info (dog name, armband)', () => {
    render(<AKCFastCatLiveScoresheet {...defaultProps} />);

    expect(screen.getByText('Dash')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders timer start/stop button', () => {
    render(<AKCFastCatLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('timer-start')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('renders result chips (Q, NQ, EX, DQ)', () => {
    render(<AKCFastCatLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('result-Q')).toBeInTheDocument();
    expect(screen.getByTestId('result-NQ')).toBeInTheDocument();
    expect(screen.getByTestId('result-EX')).toBeInTheDocument();
    expect(screen.getByTestId('result-DQ')).toBeInTheDocument();
  });

  it('calculates MPH when run time is entered — 6.5s yields ~31.5 mph', () => {
    render(<AKCFastCatLiveScoresheet {...defaultProps} />);

    const timeInput = screen.getByTestId('run-time-input');
    fireEvent.change(timeInput, { target: { value: '0:06.50' } });

    // mph = (100 * 3600) / (6.5 * 1760) = 360000 / 11440 ≈ 31.47
    const mphDisplay = screen.getByTestId('mph-display');
    expect(mphDisplay).toBeInTheDocument();
    expect(mphDisplay.textContent).toMatch(/31\.\d/);
  });

  it('calculates points as mph × 2 (rounded)', () => {
    render(<AKCFastCatLiveScoresheet {...defaultProps} />);

    const timeInput = screen.getByTestId('run-time-input');
    fireEvent.change(timeInput, { target: { value: '0:06.50' } });

    // points = round(31.47 * 2) = round(62.94) = 63
    const pointsDisplay = screen.getByTestId('points-display');
    expect(pointsDisplay).toBeInTheDocument();
    expect(pointsDisplay.textContent).toMatch(/6[23]/); // ~63
  });

  it('calls onSubmit with ScoreData when confirmed', async () => {
    const onSubmit = vi.fn();
    render(<AKCFastCatLiveScoresheet {...defaultProps} onSubmit={onSubmit} />);

    // Set a run time
    fireEvent.change(screen.getByTestId('run-time-input'), { target: { value: '0:06.50' } });
    // Select result
    fireEvent.click(screen.getByTestId('result-Q'));
    // Click submit
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

  // MYK9-1094: the app maps resultText with QUALIFICATION_TO_RESULT_STATUS, which
  // knows 'EX' (the vocabulary every other sheet sends) but not 'E'; an unknown
  // code is stored as 'pending', so an Excused FastCAT run read as unscored.
  it('submits resultText EX when Excused is chosen', async () => {
    const onSubmit = vi.fn();
    render(<AKCFastCatLiveScoresheet {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Excused' }));
    fireEvent.click(screen.getByTestId('submit-btn'));
    await waitFor(() => expect(screen.getByTestId('confirm-submit-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('confirm-submit-btn'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].resultText).toBe('EX');
  });

  it('calls onBack when back button clicked', () => {
    const onBack = vi.fn();
    render(<AKCFastCatLiveScoresheet {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('does not render found/correct toggles', () => {
    render(<AKCFastCatLiveScoresheet {...defaultProps} />);

    expect(screen.queryByLabelText(/found/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/correct/i)).not.toBeInTheDocument();
  });

  it('disables submit when no result selected', () => {
    render(<AKCFastCatLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('submit-btn')).toBeDisabled();
  });
});
