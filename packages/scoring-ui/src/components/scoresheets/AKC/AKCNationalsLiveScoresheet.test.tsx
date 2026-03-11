import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AKCNationalsLiveScoresheet } from './AKCNationalsLiveScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

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

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Check: () => <span data-testid="icon-check" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: 1,
  armband: 42,
  dogName: 'Luna',
  handlerName: 'Jane Smith',
  className: 'AKC Nationals',
  element: 'Master',
  level: 'Excellent',
};

const defaultClassInfo: ScoresheetClassInfo = { element: 'Master', level: 'Excellent' };

const defaultRules: ResolvedClassRules = {
  areaCount: 5,
  timerMode: 'single',
  maxTimeSeconds: 300,
  hideCount: 1,
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

describe('AKCNationalsLiveScoresheet', () => {
  it('renders entry info', () => {
    render(<AKCNationalsLiveScoresheet {...defaultProps} />);

    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders placement chips (1st–4th) alongside Q/NQ/EX/ABS', () => {
    render(<AKCNationalsLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('result-Q')).toBeInTheDocument();
    expect(screen.getByTestId('result-NQ')).toBeInTheDocument();
    expect(screen.getByTestId('result-ABS')).toBeInTheDocument();
    expect(screen.getByTestId('result-EX')).toBeInTheDocument();
    expect(screen.getByTestId('result-1st')).toBeInTheDocument();
    expect(screen.getByTestId('result-2nd')).toBeInTheDocument();
    expect(screen.getByTestId('result-3rd')).toBeInTheDocument();
    expect(screen.getByTestId('result-4th')).toBeInTheDocument();
  });

  it('points calculation: correct=3, incorrect=1 → (3×10)-(1×5)=25 points', () => {
    render(<AKCNationalsLiveScoresheet {...defaultProps} />);

    // Add 3 correct alerts on area 1
    const incCorrect = screen.getByTestId('correct-inc');
    fireEvent.click(incCorrect);
    fireEvent.click(incCorrect);
    fireEvent.click(incCorrect);

    // Add 1 incorrect alert on area 1
    const incIncorrect = screen.getByTestId('incorrect-inc');
    fireEvent.click(incIncorrect);

    expect(screen.getByTestId('total-points')).toHaveTextContent('25');
  });

  it('shows 5 area tabs when rules.areaCount=5', () => {
    render(<AKCNationalsLiveScoresheet {...defaultProps} />);

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByTestId(`area-tab-${i}`)).toBeInTheDocument();
    }
  });

  it('calls onSubmit with ScoreData including points', async () => {
    const onSubmit = vi.fn();
    render(<AKCNationalsLiveScoresheet {...defaultProps} onSubmit={onSubmit} />);

    // Add 2 correct alerts
    fireEvent.click(screen.getByTestId('correct-inc'));
    fireEvent.click(screen.getByTestId('correct-inc'));

    // Select Q result
    fireEvent.click(screen.getByTestId('result-Q'));

    // Click save
    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-submit-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirm-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          points: 20,
        })
      );
    });
  });

  it('excused auto-zeros all scores', () => {
    render(<AKCNationalsLiveScoresheet {...defaultProps} />);

    // Add some alerts first
    fireEvent.click(screen.getByTestId('correct-inc'));
    fireEvent.click(screen.getByTestId('incorrect-inc'));
    expect(screen.getByTestId('total-points')).toHaveTextContent('5');

    // Select Excused
    fireEvent.click(screen.getByTestId('result-EX'));

    // Points should be zeroed
    expect(screen.getByTestId('total-points')).toHaveTextContent('0');
    expect(screen.getByTestId('correct-count')).toHaveTextContent('0');
    expect(screen.getByTestId('incorrect-count')).toHaveTextContent('0');
  });

  it('calls onBack when back button clicked', () => {
    const onBack = vi.fn();
    render(<AKCNationalsLiveScoresheet {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });
});
