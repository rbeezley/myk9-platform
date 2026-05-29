import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UKCRallyLiveScoresheet } from './UKCRallyLiveScoresheet';
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
    getRemainingTime: () => '5:00.00',
    getMaxTimeMs: () => 300000,
    getRemainingTimeMs: () => 300000,
    shouldShow30SecondWarning: () => false,
    isTimeExpired: () => false,
    getWarningMessage: () => null,
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Minus: () => <span data-testid="icon-minus" />,
  Plus: () => <span data-testid="icon-plus" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: '1',
  armband: 42,
  dogName: 'Rally Dog',
  handlerName: 'Jane Smith',
  className: 'UKC Rally',
  element: 'Rally',
  level: 'Novice',
};

const defaultClassInfo: ScoresheetClassInfo = { element: 'Rally', level: 'Novice' };

const defaultRules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 300,
  hideCount: null,
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

describe('UKCRallyLiveScoresheet', () => {
  it('renders entry info (dog name, armband, handler)', () => {
    render(<UKCRallyLiveScoresheet {...defaultProps} />);

    expect(screen.getByText('Rally Dog')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders score display: Starting 100, Deductions counter, Final Score', () => {
    render(<UKCRallyLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('starting-score')).toHaveTextContent('100');
    expect(screen.getByTestId('deduction-count')).toHaveTextContent('0');
    expect(screen.getByTestId('final-score')).toHaveTextContent('100');
  });

  it('deduction counter works: + increases, - decreases', () => {
    render(<UKCRallyLiveScoresheet {...defaultProps} />);

    const increase = screen.getByTestId('deduction-increase');
    const decrease = screen.getByTestId('deduction-decrease');
    const count = screen.getByTestId('deduction-count');

    fireEvent.click(increase);
    fireEvent.click(increase);
    expect(count).toHaveTextContent('2');

    fireEvent.click(decrease);
    expect(count).toHaveTextContent('1');
  });

  it('final score = 100 - deductions', () => {
    render(<UKCRallyLiveScoresheet {...defaultProps} />);

    const increase = screen.getByTestId('deduction-increase');
    fireEvent.click(increase); // deductions = 1
    fireEvent.click(increase); // deductions = 2
    fireEvent.click(increase); // deductions = 3

    expect(screen.getByTestId('final-score')).toHaveTextContent('97');
  });

  it('auto-qualifying badge: deductions=25 → score=75 → shows Qualifying', () => {
    render(<UKCRallyLiveScoresheet {...defaultProps} />);

    const increase = screen.getByTestId('deduction-increase');
    // Click 25 times
    for (let i = 0; i < 25; i++) {
      fireEvent.click(increase);
    }

    const badge = screen.getByTestId('auto-qualifying-badge');
    expect(badge).toHaveTextContent('Qualifying');
    expect(screen.getByTestId('final-score')).toHaveTextContent('75');
  });

  it('auto-qualifying badge: deductions=35 → score=65 → shows Non-Qualifying', () => {
    render(<UKCRallyLiveScoresheet {...defaultProps} />);

    const increase = screen.getByTestId('deduction-increase');
    // Click 35 times
    for (let i = 0; i < 35; i++) {
      fireEvent.click(increase);
    }

    const badge = screen.getByTestId('auto-qualifying-badge');
    expect(badge).toHaveTextContent('Non-Qualifying');
    expect(screen.getByTestId('final-score')).toHaveTextContent('65');
  });

  it('calls onSubmit with ScoreData when confirmed', async () => {
    const onSubmit = vi.fn();
    render(<UKCRallyLiveScoresheet {...defaultProps} onSubmit={onSubmit} />);

    // Select Q result explicitly
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
          points: 100,
        })
      );
    });
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<UKCRallyLiveScoresheet {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });
});
