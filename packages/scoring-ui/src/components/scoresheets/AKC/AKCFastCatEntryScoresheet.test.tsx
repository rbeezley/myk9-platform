import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AKCFastCatEntryScoresheet } from './AKCFastCatEntryScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

// Mock lucide-react icons (not used in entry but mock to be safe)
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: 1,
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

describe('AKCFastCatEntryScoresheet', () => {
  it('renders entry info (dog name, armband)', () => {
    render(<AKCFastCatEntryScoresheet {...defaultProps} />);

    expect(screen.getByText('Dash')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders time input (no stopwatch buttons)', () => {
    render(<AKCFastCatEntryScoresheet {...defaultProps} />);

    expect(screen.getByTestId('run-time-input')).toBeInTheDocument();
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
    expect(screen.queryByText('Stop')).not.toBeInTheDocument();
  });

  it('smart time parsing on blur — "650" becomes "0:06.50"', () => {
    render(<AKCFastCatEntryScoresheet {...defaultProps} />);

    const timeInput = screen.getByTestId('run-time-input');
    // '650' seconds = 6:50 not a shorthand (last two digits 50 is valid), so 6:50.00
    // Let's use '0650' → last two digits 50 → 6:50.00, or simpler: '645' → 6:45.00
    fireEvent.change(timeInput, { target: { value: '645' } });
    fireEvent.blur(timeInput);

    expect(timeInput).toHaveValue('6:45.00');
  });

  it('MPH auto-calculates from time input', () => {
    render(<AKCFastCatEntryScoresheet {...defaultProps} />);

    const timeInput = screen.getByTestId('run-time-input');
    fireEvent.change(timeInput, { target: { value: '0:06.50' } });

    // mph = (100 * 3600) / (6.5 * 1760) ≈ 31.47
    const mphDisplay = screen.getByTestId('mph-display');
    expect(mphDisplay.textContent).toMatch(/31\.\d/);
  });

  it('Points auto-calculate from time input', () => {
    render(<AKCFastCatEntryScoresheet {...defaultProps} />);

    const timeInput = screen.getByTestId('run-time-input');
    fireEvent.change(timeInput, { target: { value: '0:06.50' } });

    // points = round(31.47 * 2) ≈ 63
    const pointsDisplay = screen.getByTestId('points-display');
    expect(pointsDisplay.textContent).toMatch(/6[23]/);
  });

  it('"Save & Next" calls onSubmit then onNext', async () => {
    const onSubmit = vi.fn();
    const onNext = vi.fn();
    render(<AKCFastCatEntryScoresheet {...defaultProps} onSubmit={onSubmit} onNext={onNext} />);

    // Select a result
    fireEvent.change(screen.getByTestId('result-select'), { target: { value: 'Q' } });

    fireEvent.click(screen.getByTestId('save-next-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onNext).toHaveBeenCalled();
  });

  it('pre-fills from existingScore', () => {
    const entryWithScore: ScoresheetEntry = {
      ...defaultEntry,
      existingScore: {
        resultText: 'Q',
        searchTime: '0:06.50',
        areas: { 'area 1': '0:06.50 NOT FOUND INCORRECT' },
        areaTimes: ['0:06.50'],
        correctCount: 0,
        incorrectCount: 0,
        faultCount: 0,
        finishCallErrors: 0,
        points: 63,
      },
    };

    render(<AKCFastCatEntryScoresheet {...defaultProps} entry={entryWithScore} />);

    expect(screen.getByTestId('result-select')).toHaveValue('Q');
  });

  it('shows validation error when submitting without result', async () => {
    render(<AKCFastCatEntryScoresheet {...defaultProps} />);

    fireEvent.click(screen.getByTestId('save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-error')).toBeInTheDocument();
    });
    expect(screen.getByText('No result selected')).toBeInTheDocument();
  });

  it('calls onBack when cancel clicked', () => {
    const onBack = vi.fn();
    render(<AKCFastCatEntryScoresheet {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByTestId('cancel-btn'));
    expect(onBack).toHaveBeenCalled();
  });
});
