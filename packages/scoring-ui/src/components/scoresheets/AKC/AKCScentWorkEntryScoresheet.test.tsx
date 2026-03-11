import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AKCScentWorkEntryScoresheet } from './AKCScentWorkEntryScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo } from '../../../types';
import type { ResolvedClassRules } from '../../../types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  X: () => <span data-testid="icon-x" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: 1,
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

const defaultProps = {
  entry: defaultEntry,
  classInfo: defaultClassInfo,
  rules: defaultRules,
  onSubmit: vi.fn(),
  onBack: vi.fn(),
};

describe('AKCScentWorkEntryScoresheet', () => {
  it('renders entry info (dog name, armband, handler)', () => {
    render(<AKCScentWorkEntryScoresheet {...defaultProps} />);

    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders time input fields (no stopwatch)', () => {
    render(<AKCScentWorkEntryScoresheet {...defaultProps} />);

    expect(screen.getByLabelText('Area 1 time')).toBeInTheDocument();
    // No start/stop buttons
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
    expect(screen.queryByText('Stop')).not.toBeInTheDocument();
  });

  it('smart time parsing on blur (type "123", field shows "1:23.00")', () => {
    render(<AKCScentWorkEntryScoresheet {...defaultProps} />);

    const timeInput = screen.getByLabelText('Area 1 time');
    fireEvent.change(timeInput, { target: { value: '123' } });
    fireEvent.blur(timeInput);

    expect(timeInput).toHaveValue('1:23.00');
  });

  it('renders result as select (not giant chips)', () => {
    render(<AKCScentWorkEntryScoresheet {...defaultProps} />);

    const select = screen.getByTestId('result-select');
    expect(select.tagName).toBe('SELECT');
  });

  it('shows NQ reason when NQ selected', () => {
    render(<AKCScentWorkEntryScoresheet {...defaultProps} />);

    // NQ reason should not be visible initially
    expect(screen.queryByTestId('nq-reason-select')).not.toBeInTheDocument();

    // Select NQ
    fireEvent.change(screen.getByTestId('result-select'), { target: { value: 'NQ' } });

    expect(screen.getByTestId('nq-reason-select')).toBeInTheDocument();
  });

  it('fault counter as number input', () => {
    render(<AKCScentWorkEntryScoresheet {...defaultProps} />);

    const faultInput = screen.getByTestId('fault-input');
    expect(faultInput).toHaveAttribute('type', 'number');

    fireEvent.change(faultInput, { target: { value: '3' } });
    expect(faultInput).toHaveValue(3);
  });

  it('"Save & Next" calls onSubmit then onNext', async () => {
    const onSubmit = vi.fn();
    const onNext = vi.fn();
    render(<AKCScentWorkEntryScoresheet {...defaultProps} onSubmit={onSubmit} onNext={onNext} />);

    // Select a result
    fireEvent.change(screen.getByTestId('result-select'), { target: { value: 'Q' } });

    fireEvent.click(screen.getByTestId('save-next-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onNext).toHaveBeenCalled();
  });

  it('"Save" calls onSubmit only when no onNext', async () => {
    const onSubmit = vi.fn();
    render(<AKCScentWorkEntryScoresheet {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('result-select'), { target: { value: 'Q' } });
    fireEvent.click(screen.getByTestId('save-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  it('calls onBack when cancel clicked', () => {
    const onBack = vi.fn();
    render(<AKCScentWorkEntryScoresheet {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByTestId('cancel-btn'));
    expect(onBack).toHaveBeenCalled();
  });

  it('pre-fills from existingScore', () => {
    const entryWithScore: ScoresheetEntry = {
      ...defaultEntry,
      existingScore: {
        resultText: 'Q',
        searchTime: '1:23.00',
        areas: { 'area 1': '1:23.00 FOUND CORRECT' },
        areaTimes: ['1:23.00'],
        correctCount: 1,
        incorrectCount: 0,
        faultCount: 2,
        finishCallErrors: 0,
        points: 0,
      },
    };

    render(<AKCScentWorkEntryScoresheet {...defaultProps} entry={entryWithScore} />);

    // Result should be pre-selected
    expect(screen.getByTestId('result-select')).toHaveValue('Q');
    // Fault count should be pre-filled
    expect(screen.getByTestId('fault-input')).toHaveValue(2);
  });

  it('shows validation error when submitting without result', async () => {
    render(<AKCScentWorkEntryScoresheet {...defaultProps} />);

    // Try to save without selecting a result
    fireEvent.click(screen.getByTestId('save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-error')).toBeInTheDocument();
    });
    expect(screen.getByText('No result selected')).toBeInTheDocument();
  });
});
