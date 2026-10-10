import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UKCNoseworkLiveScoresheet } from './UKCNoseworkLiveScoresheet';
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
