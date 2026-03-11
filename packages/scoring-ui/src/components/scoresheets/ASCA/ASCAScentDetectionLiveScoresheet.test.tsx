import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ASCAScentDetectionLiveScoresheet } from './ASCAScentDetectionLiveScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo } from '../../../types';
import type { ResolvedClassRules } from '../../../types';

const defaultEntry: ScoresheetEntry = {
  id: 1,
  armband: 42,
  dogName: 'Rex',
  handlerName: 'Jane Smith',
  className: 'ASCA Scent Detection',
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

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  ClipboardCheck: () => <span data-testid="icon-clipboard" />,
  X: () => <span data-testid="icon-x" />,
}));

const defaultProps = {
  entry: defaultEntry,
  classInfo: defaultClassInfo,
  rules: defaultRules,
  onSubmit: vi.fn(),
  onBack: vi.fn(),
};

describe('ASCAScentDetectionLiveScoresheet', () => {
  it('renders entry info (dog name, armband, handler)', () => {
    render(<ASCAScentDetectionLiveScoresheet {...defaultProps} />);

    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders timer start button', () => {
    render(<ASCAScentDetectionLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('timer-start')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('renders area sections based on rules.areaCount (areaCount=2)', () => {
    const rules2: ResolvedClassRules = { ...defaultRules, areaCount: 2 };
    render(<ASCAScentDetectionLiveScoresheet {...defaultProps} rules={rules2} />);

    expect(screen.getByLabelText('Area 1 time')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 2 time')).toBeInTheDocument();
  });

  it('renders result chips (Q, NQ, ABS, EX)', () => {
    render(<ASCAScentDetectionLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('result-Q')).toBeInTheDocument();
    expect(screen.getByTestId('result-NQ')).toBeInTheDocument();
    expect(screen.getByTestId('result-ABS')).toBeInTheDocument();
    expect(screen.getByTestId('result-EX')).toBeInTheDocument();
  });

  it('shows fault counter when Q is selected', () => {
    render(<ASCAScentDetectionLiveScoresheet {...defaultProps} />);

    fireEvent.click(screen.getByTestId('result-Q'));

    expect(screen.getByTestId('fault-decrement')).toBeInTheDocument();
    expect(screen.getByTestId('fault-increment')).toBeInTheDocument();
  });

  it('calls onSubmit when confirmed', async () => {
    const onSubmit = vi.fn();
    render(<ASCAScentDetectionLiveScoresheet {...defaultProps} onSubmit={onSubmit} />);

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
    render(<ASCAScentDetectionLiveScoresheet {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });
});
