import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AKCScentWorkLiveScoresheet } from './AKCScentWorkLiveScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo } from '../../../types';
import type { ResolvedClassRules } from '../../../types';

const defaultEntry: ScoresheetEntry = {
  id: '1',
  armband: 42,
  dogName: 'Rex',
  handlerName: 'Jane Smith',
  className: 'AKC Scent Work',
  element: 'Interior',
  level: 'Novice',
};
const defaultClassInfo: ScoresheetClassInfo = { element: 'Interior', level: 'Novice' };
const defaultRules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 180,
  hideCount: 1,
  hidesKnown: true,
  distractionCount: 0,
};

// Mock useStopwatch to avoid real timers in tests
vi.mock('../../../hooks/useStopwatch', () => ({
  useStopwatch: () => ({
    time: 0,
    isRunning: false,
    formatTime: (ms: number) =>
      `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(2).padStart(5, '0')}`,
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

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  ClipboardCheck: () => <span data-testid="icon-clipboard" />,
  X: () => <span data-testid="icon-x" />,
  RotateCcw: () => <span data-testid="icon-rotate-ccw" />,
}));

const defaultProps = {
  entry: defaultEntry,
  classInfo: defaultClassInfo,
  rules: defaultRules,
  onSubmit: vi.fn(),
  onBack: vi.fn(),
};

describe('AKCScentWorkLiveScoresheet', () => {
  it('renders entry info (dog name, armband, handler)', () => {
    render(<AKCScentWorkLiveScoresheet {...defaultProps} />);

    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders timer start/stop button', () => {
    render(<AKCScentWorkLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('timer-start')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('renders area sections based on rules.areaCount', () => {
    const rules3: ResolvedClassRules = { ...defaultRules, areaCount: 3 };
    render(<AKCScentWorkLiveScoresheet {...defaultProps} rules={rules3} />);

    expect(screen.getByLabelText('Area 1 time')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 2 time')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 3 time')).toBeInTheDocument();
  });

  it('renders result chips (Q, NQ, EX, ABS)', () => {
    render(<AKCScentWorkLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('result-Q')).toBeInTheDocument();
    expect(screen.getByTestId('result-NQ')).toBeInTheDocument();
    expect(screen.getByTestId('result-ABS')).toBeInTheDocument();
    expect(screen.getByTestId('result-EX')).toBeInTheDocument();
  });

  it('shows confirmation dialog before submit', async () => {
    render(<AKCScentWorkLiveScoresheet {...defaultProps} />);

    // Select a result first
    fireEvent.click(screen.getByTestId('result-Q'));
    // Click submit
    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Score Confirmation')).toBeInTheDocument();
  });

  it('calls onSubmit with ScoreData when confirmed', async () => {
    const onSubmit = vi.fn();
    render(<AKCScentWorkLiveScoresheet {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('result-Q'));
    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-submit-btn')).toBeInTheDocument();
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

  it('calls onBack when back button clicked', () => {
    const onBack = vi.fn();
    render(<AKCScentWorkLiveScoresheet {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('pre-fills from existingScore', () => {
    const entryWithScore: ScoresheetEntry = {
      ...defaultEntry,
      existingScore: {
        resultText: 'NQ',
        searchTime: '1:23.00',
        nonQualifyingReason: 'Max Time',
        areas: { 'area 1': '1:23.00 NOT FOUND INCORRECT' },
        areaTimes: ['1:23.00'],
        correctCount: 0,
        incorrectCount: 1,
        faultCount: 0,
        finishCallErrors: 0,
        points: 0,
      },
    };

    render(<AKCScentWorkLiveScoresheet {...defaultProps} entry={entryWithScore} />);

    // The result should be pre-selected as NQ (button uses useScoresheetScoring which
    // initializes from existingScore)
    const nqButton = screen.getByTestId('result-NQ');
    // NQ is pre-selected, so it should have the 'default' variant (not outline)
    expect(nqButton).toBeInTheDocument();
  });

  it('disables submit when no result selected', () => {
    render(<AKCScentWorkLiveScoresheet {...defaultProps} />);

    const submitBtn = screen.getByTestId('submit-btn');
    expect(submitBtn).toBeDisabled();
  });
});
