import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ASCAScentDetectionEntryScoresheet } from './ASCAScentDetectionEntryScoresheet';
import type { ScoresheetEntry, ScoresheetClassInfo } from '../../../types';
import type { ResolvedClassRules } from '../../../types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  X: () => <span data-testid="icon-x" />,
}));

const defaultEntry: ScoresheetEntry = {
  id: '1',
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

const defaultProps = {
  entry: defaultEntry,
  classInfo: defaultClassInfo,
  rules: defaultRules,
  onSubmit: vi.fn(),
  onBack: vi.fn(),
};

describe('ASCAScentDetectionEntryScoresheet', () => {
  it('renders entry info (dog name, armband, handler)', () => {
    render(<ASCAScentDetectionEntryScoresheet {...defaultProps} />);

    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders area rows with time inputs', () => {
    const rules2: ResolvedClassRules = { ...defaultRules, areaCount: 2 };
    render(<ASCAScentDetectionEntryScoresheet {...defaultProps} rules={rules2} />);

    expect(screen.getByLabelText('Area 1 time')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 2 time')).toBeInTheDocument();
    // No start/stop buttons (entry mode has no stopwatch)
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
    expect(screen.queryByText('Stop')).not.toBeInTheDocument();
  });

  it('smart time parsing on blur (type "123", field shows "1:23.00")', () => {
    render(<ASCAScentDetectionEntryScoresheet {...defaultProps} />);

    const timeInput = screen.getByLabelText('Area 1 time');
    fireEvent.change(timeInput, { target: { value: '123' } });
    fireEvent.blur(timeInput);

    expect(timeInput).toHaveValue('1:23.00');
  });

  it('renders found and correct checkboxes per area', () => {
    render(<ASCAScentDetectionEntryScoresheet {...defaultProps} />);

    expect(screen.getByLabelText('Area 1 found')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 1 correct')).toBeInTheDocument();
  });

  it('"Save & Next" calls onSubmit then onNext', async () => {
    const onSubmit = vi.fn();
    const onNext = vi.fn();
    render(
      <ASCAScentDetectionEntryScoresheet {...defaultProps} onSubmit={onSubmit} onNext={onNext} />
    );

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

    render(<ASCAScentDetectionEntryScoresheet {...defaultProps} entry={entryWithScore} />);

    expect(screen.getByTestId('result-select')).toHaveValue('Q');
    expect(screen.getByTestId('fault-input')).toHaveValue(2);
  });
});
