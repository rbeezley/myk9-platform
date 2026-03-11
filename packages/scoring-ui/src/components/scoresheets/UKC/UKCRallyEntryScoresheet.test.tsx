import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UKCRallyEntryScoresheet } from './UKCRallyEntryScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo, ResolvedClassRules } from '../../../types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: 1,
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

describe('UKCRallyEntryScoresheet', () => {
  it('renders entry info (dog name, armband, handler)', () => {
    render(<UKCRallyEntryScoresheet {...defaultProps} />);

    expect(screen.getByText('Rally Dog')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders deductions input and final score display', () => {
    render(<UKCRallyEntryScoresheet {...defaultProps} />);

    expect(screen.getByTestId('deductions-input')).toBeInTheDocument();
    expect(screen.getByTestId('final-score-display')).toBeInTheDocument();
    // Initial state: 0 deductions → 100 final score
    expect(screen.getByTestId('final-score-display')).toHaveTextContent('100');
  });

  it('course time input accepts smart time parsing on blur', () => {
    render(<UKCRallyEntryScoresheet {...defaultProps} />);

    const timeInput = screen.getByTestId('course-time-input');
    // "123" → 1:23.00 (secretary shorthand: last 2 digits = seconds)
    fireEvent.change(timeInput, { target: { value: '123' } });
    fireEvent.blur(timeInput);

    expect(timeInput).toHaveValue('1:23.00');
  });

  it('result select shows Q and NQ options only', () => {
    render(<UKCRallyEntryScoresheet {...defaultProps} />);

    const select = screen.getByTestId('result-select');
    expect(select).toBeInTheDocument();

    // Q and NQ options present
    expect(screen.getByText('Qualified (Q)')).toBeInTheDocument();
    expect(screen.getByText('Not Qualified (NQ)')).toBeInTheDocument();

    // No ABS or EX options
    expect(screen.queryByText(/Absent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Excused/)).not.toBeInTheDocument();
  });

  it('"Save & Next" calls onSubmit then onNext', async () => {
    const onSubmit = vi.fn();
    const onNext = vi.fn();
    render(<UKCRallyEntryScoresheet {...defaultProps} onSubmit={onSubmit} onNext={onNext} />);

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
        resultText: 'NQ',
        searchTime: '1:30.00',
        nonQualifyingReason: 'Handler Error',
        areas: {},
        areaTimes: ['1:30.00'],
        correctCount: 0,
        incorrectCount: 0,
        faultCount: 15,
        finishCallErrors: 0,
        points: 85,
      },
    };

    render(<UKCRallyEntryScoresheet {...defaultProps} entry={entryWithScore} />);

    // Result select should show NQ
    expect(screen.getByTestId('result-select')).toHaveValue('NQ');
    // Course time pre-filled
    expect(screen.getByTestId('course-time-input')).toHaveValue('1:30.00');
    // Deductions = 100 - 85 = 15
    expect(screen.getByTestId('deductions-input')).toHaveValue(15);
  });
});
