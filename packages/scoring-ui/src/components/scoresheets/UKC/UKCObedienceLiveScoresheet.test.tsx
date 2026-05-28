import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UKCObedienceLiveScoresheet } from './UKCObedienceLiveScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: '1',
  armband: 7,
  dogName: 'Rex',
  handlerName: 'Jane Smith',
  className: 'UKC Obedience',
};

const defaultClassInfo: ScoresheetClassInfo = { element: 'Obedience', level: 'Novice' };

const defaultRules: ResolvedClassRules = {
  areaCount: 1,
  timerMode: 'single',
  maxTimeSeconds: 0,
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

describe('UKCObedienceLiveScoresheet', () => {
  it('renders entry info (dog name, armband, handler)', () => {
    render(<UKCObedienceLiveScoresheet {...defaultProps} />);

    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders points input with "out of 200.0" label', () => {
    render(<UKCObedienceLiveScoresheet {...defaultProps} />);

    expect(screen.getByTestId('points-input')).toBeInTheDocument();
    expect(screen.getByText('out of 200.0')).toBeInTheDocument();
  });

  it('auto-qualifying: entering 175 shows Q indicator', () => {
    render(<UKCObedienceLiveScoresheet {...defaultProps} />);

    fireEvent.change(screen.getByTestId('points-input'), { target: { value: '175' } });

    const badge = screen.getByTestId('auto-qualify-badge');
    expect(badge).toHaveTextContent('Qualifying');
  });

  it('auto-qualifying: entering 160 shows NQ indicator', () => {
    render(<UKCObedienceLiveScoresheet {...defaultProps} />);

    fireEvent.change(screen.getByTestId('points-input'), { target: { value: '160' } });

    const badge = screen.getByTestId('auto-qualify-badge');
    expect(badge).toHaveTextContent('Non-Qualifying');
  });

  it('manual override: clicking EX button sets result to EX', () => {
    render(<UKCObedienceLiveScoresheet {...defaultProps} />);

    fireEvent.click(screen.getByTestId('result-EX'));

    // EX button should now be active (has default variant styling)
    const exBtn = screen.getByTestId('result-EX');
    expect(exBtn).toBeInTheDocument();
    // NQ reason input should appear since result is not Q
    expect(screen.getByTestId('nq-reason-input')).toBeInTheDocument();
  });

  it('calls onSubmit with points in ScoreData when confirmed', async () => {
    const onSubmit = vi.fn();
    render(<UKCObedienceLiveScoresheet {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('points-input'), { target: { value: '185' } });
    fireEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirm-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          points: 185,
          resultText: 'Q',
        })
      );
    });
  });

  it('no timer rendered', () => {
    render(<UKCObedienceLiveScoresheet {...defaultProps} />);

    // There should be no timer start/stop button or timer display
    expect(screen.queryByTestId('timer-start')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timer-stop')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-timer-display')).not.toBeInTheDocument();
  });
});
